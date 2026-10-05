import { createServiceClient } from "@/lib/supabase/server"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"
import { intakeIsDryRun, readBoundedJson } from "@/lib/website/intake-guard"
import { findBySubmission, intakeMetadata, SUBMISSION_UUID } from "@/lib/website/intake-dedupe"
import { conversionToken } from "@/lib/website/conversion-token"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/**
 * Public lead / contact-form submission from the SHWURX website.
 * Requires at least one contact method (phone or email). Writes through the
 * `submit_lead` SECURITY DEFINER RPC, then alerts staff who manage leads.
 */
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request)
    if (!body) return jsonWithCors(request, { ok: false, outcome: "rejected", error: "bad_request" }, 413)
    const name = String(body?.name ?? "").trim()
    const phone = String(body?.phone ?? "").trim()
    const email = String(body?.email ?? "").trim()

    if (!phone && !email) {
      return jsonWithCors(request, { ok: false, outcome: "invalid", error: "missing_contact" }, 400)
    }

    // Previews validate but never create production leads or staff alerts.
    if (await intakeIsDryRun()) return jsonWithCors(request, { ok: true, outcome: "dry_run", id: null })

    // A retry of the same browser submission returns the same record, never a second lead.
    const submissionId = typeof body.submissionId === "string" && SUBMISSION_UUID.test(body.submissionId) ? body.submissionId : null
    const persisted = (outcome: "received" | "duplicate", id: string) =>
      jsonWithCors(request, { ok: true, outcome, id, conversionToken: conversionToken("lead", id) })
    if (submissionId) {
      const existing = await findBySubmission("leads", submissionId)
      if (existing) return persisted("duplicate", existing)
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("submit_lead", {
      p_name: name || null,
      p_phone: phone || null,
      p_email: email || null,
      p_message: body?.message ?? null,
      p_service_interest: body?.serviceInterest ?? body?.service_interest ?? null,
      p_source: body?.source ?? "website",
      p_metadata: intakeMetadata(body, "contact", submissionId, []),
    })

    if (error || !data?.ok) {
      // Lost a race on the unique submission index: the other request's row is the answer.
      const raced = submissionId ? await findBySubmission("leads", submissionId) : null
      if (raced) return persisted("duplicate", raced)
    }
    if (error) return jsonWithCors(request, { ok: false, outcome: "error", error: "not_persisted" }, 400)
    if (!data?.ok || !data?.id) return jsonWithCors(request, { ok: false, outcome: "error", error: data?.error ?? "not_persisted" }, 400)

    try {
      await notifyByPermission("leads.manage", {
        title: "New website enquiry",
        body: `${name || "A visitor"} left an enquiry via the website.`,
        type: "info",
        link: "/leads",
      })
    } catch {
      /* notification is best-effort */
    }

    return persisted("received", String(data.id))
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
