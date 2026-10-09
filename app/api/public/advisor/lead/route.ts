import { generateText } from "ai"
import { createServiceClient } from "@/lib/supabase/server"
import { getPublishedDocumentStrict } from "@/lib/website/store"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { validatePhone } from "@/lib/website/intake-validate"
import { SUBMISSION_UUID, findBySubmission } from "@/lib/website/intake-dedupe"
import { publicPath } from "@/lib/website/intake-attribution"
import { notifyByPermission } from "@/lib/actions-notifications"
import { advisorAnswerEmail, sendEmail } from "@/lib/email"
import { localePath, SITE_URL } from "@/lib/website/render"
import { ADVISOR_MODEL, advisorKnowledge, advisorSystemPrompt, cleanTranscript } from "@/lib/website/advisor-knowledge"

export const runtime = "nodejs"
export const maxDuration = 60

type Outcome = "received" | "duplicate" | "dry_run" | "invalid" | "rejected" | "rate_limited" | "unavailable" | "error"

const EMAIL = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,190}\.[a-z]{2,24}$/i
const MIN_FILL_MS = 2000

function str(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""
}

const reply = (outcome: Outcome, status: number, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: outcome === "received" || outcome === "duplicate" || outcome === "dry_run", outcome, ...extra }, { status })

export async function POST(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") return reply("rejected", 403)
    const body = await readBoundedJson(request)
    if (!body) return reply("rejected", 413)
    if (str(body.website, 200)) return reply("rejected", 400)

    const startedAt = Number(body.startedAt)
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) return reply("invalid", 400, { fields: { form: "too_fast" } })

    const submissionId = str(body.submissionId, 40)
    if (!SUBMISSION_UUID.test(submissionId)) return reply("invalid", 400, { fields: { form: "bad_submission" } })

    const errors: Record<string, string> = {}
    const name = str(body.name, 80)
    const email = str(body.email, 254).toLowerCase()
    const phoneCheck = validatePhone(body.phone, { required: true })
    if (name.length < 2) errors.name = "required"
    if (!EMAIL.test(email)) errors.email = "invalid"
    if (!phoneCheck.ok) errors.phone = phoneCheck.error
    const transcript = cleanTranscript(body.messages)
    if (!transcript.some((m) => m.role === "user")) errors.form = "no_question"
    if (Object.keys(errors).length || !phoneCheck.ok) return reply("invalid", 400, { fields: errors })

    const lang = body.locale === "ar" ? "ar" : "en"
    const phone = phoneCheck.value ?? ""
    const phoneDigits = phoneCheck.digits ?? ""

    if (await intakeIsDryRun()) return reply("dry_run", 200, { emailed: false })

    const existing = await findBySubmission("leads", submissionId)
    if (existing) return reply("duplicate", 200, { emailed: true })

    const svc = createServiceClient()
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await svc
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>phone_digits", phoneDigits)
      .gte("created_at", since)
    if ((count ?? 0) >= 3) return reply("rate_limited", 429)

    const doc = await getPublishedDocumentStrict()
    if (!doc) return reply("unavailable", 503)

    let writeUp = ""
    let vehicle: string | null = null
    try {
      const { text } = await generateText({
        model: ADVISOR_MODEL,
        system: advisorSystemPrompt(advisorKnowledge(doc, lang), lang),
        messages: [
          ...transcript,
          {
            role: "user",
            content: [
              `Write the complete answer to email to ${name}. Cover the whole conversation above, not just the last message.`,
              "Structure it as short plain-text sections separated by blank lines, each starting with a short label line:",
              "Your car / What you described / Likely causes / What we would check / Is it safe to drive / Recommended next step.",
              "Use '-' bullets inside sections. No markdown symbols, no prices. Keep it under 350 words.",
              "On the very first line write only: VEHICLE: <brand model year as described, or unknown>.",
            ].join("\n"),
          },
        ],
        maxOutputTokens: 1200,
      })
      const [first, ...rest] = text.trim().split("\n")
      const match = first?.match(/^VEHICLE:\s*(.+)$/i)
      if (match) {
        vehicle = /^unknown$/i.test(match[1].trim()) ? null : match[1].trim().slice(0, 80)
        writeUp = rest.join("\n").trim()
      } else {
        writeUp = text.trim()
      }
    } catch (e) {
      console.error("advisor write-up failed:", (e as Error)?.message)
    }

    const conversation = transcript
      .map((m) => `${m.role === "user" ? "Visitor" : "AI advisor"}: ${m.content}`)
      .join("\n\n")
      .slice(0, 6000)

    const { data, error } = await svc.rpc("submit_lead", {
      p_name: name,
      p_phone: phone,
      p_email: email,
      p_message: [vehicle && `Vehicle: ${vehicle}`, "AI advisor conversation:", conversation].filter(Boolean).join("\n"),
      p_service_interest: vehicle ? `AI advisor · ${vehicle}` : "AI advisor",
      p_source: "website",
      p_metadata: {
        kind: "ai_advisor",
        submission_id: submissionId,
        locale: lang,
        phone_digits: phoneDigits,
        vehicle,
        turns: transcript.length,
        submit_path: publicPath(body.submitPath),
      },
    })
    if (error) {
      if (error.code === "23505" && (await findBySubmission("leads", submissionId))) return reply("duplicate", 200, { emailed: true })
      return reply("error", 500)
    }
    if (!data?.ok || !data?.id) return reply("error", 500)

    try {
      await notifyByPermission("leads.manage", {
        title: "New AI advisor lead",
        body: `${name}${vehicle ? ` (${vehicle})` : ""} asked the website AI advisor and left their contact details.`,
        type: "info",
        link: "/leads",
      })
    } catch {
      /* notification is best-effort */
    }

    let emailed = false
    if (writeUp) {
      const sent = await sendEmail({
        to: email,
        subject: lang === "ar" ? "إجابتك الكاملة من SHWURX" : "Your complete answer from SHWURX",
        html: advisorAnswerEmail({ name, vehicle, writeUp, lang, bookUrl: `${SITE_URL}${localePath(lang, "/appointment")}` }),
        idempotencyKey: `advisor-answer-${submissionId}`,
      })
      emailed = sent.sent
    }

    return reply("received", 200, { emailed })
  } catch (e) {
    console.error("advisor lead failed:", (e as Error)?.message)
    return reply("error", 500)
  }
}
