import { createPublicClient } from "@/lib/supabase/public"
import { createServiceClient } from "@/lib/supabase/server"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"
import { getPublishedDocumentStrict } from "@/lib/website/store"
import { intakeIsDryRun, normalizePhone, readBoundedJson } from "@/lib/website/intake-guard"
import { isPublicSitePath } from "@/lib/website/paths"
import type { WebsiteDocument } from "@/lib/website/types"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

/**
 * Every response carries an explicit outcome. Only "received" (a new persisted
 * lead) and "duplicate" (the same submission already persisted) include an id,
 * and only "received" may be counted as a conversion or alert staff.
 */
type Outcome = "received" | "duplicate" | "dry_run" | "invalid" | "rejected" | "rate_limited" | "unavailable" | "error"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9-]{1,60}$/
const MIN_FILL_MS = 2500
export const MIN_VEHICLE_YEAR = 2016

function str(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""
}
const optStr = (v: unknown, max: number) => str(v, max) || null

function reply(request: Request, outcome: Outcome, status: number, extra: Record<string, unknown> = {}) {
  const ok = outcome === "received" || outcome === "duplicate" || outcome === "dry_run"
  return jsonWithCors(request, { ok, outcome, ...extra }, status)
}

/** Strips query strings (which may carry tokens) and refuses non-website paths. */
function publicPath(v: unknown): string | null {
  const p = str(v, 200).split(/[?#]/)[0]
  return p.startsWith("/") && isPublicSitePath(p) ? p : null
}

function sanitizedReferrer(v: unknown): string | null {
  const s = str(v, 300)
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null
  } catch {
    return null
  }
}

function attribution(a: Record<string, unknown>) {
  return {
    utm: {
      source: optStr(a.utm_source, 120),
      medium: optStr(a.utm_medium, 120),
      campaign: optStr(a.utm_campaign, 120),
      content: optStr(a.utm_content, 120),
      term: optStr(a.utm_term, 120),
    },
    click_ids: { gclid: optStr(a.gclid, 200), gbraid: optStr(a.gbraid, 200), wbraid: optStr(a.wbraid, 200) },
    landing_path: publicPath(a.landingPath),
    referrer: sanitizedReferrer(a.referrer),
    at: optStr(a.at, 40),
  }
}

async function findBySubmission(submissionId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("leads")
    .select("id")
    .eq("metadata->>submission_id", submissionId)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Contextual website enquiry into the existing `submit_lead` CRM pipeline.
 * Brand/service context is re-derived from the PUBLISHED document only.
 */
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request)
    if (!body) return reply(request, "rejected", 413)

    // Honeypot: tell the bot nothing useful and never claim a lead exists.
    if (str(body.website, 200)) return reply(request, "rejected", 400)
    const startedAt = Number(body.startedAt)
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
      return reply(request, "invalid", 400, { fields: { form: "too_fast" } })
    }

    const submissionId = str(body.submissionId, 40)
    if (!UUID.test(submissionId)) return reply(request, "invalid", 400, { fields: { form: "bad_submission" } })

    const doc: WebsiteDocument | null = await getPublishedDocumentStrict()
    if (!doc) return reply(request, "unavailable", 503)
    if (!doc.forms.enquiry.enabled) return reply(request, "unavailable", 403)

    const errors: Record<string, string> = {}
    const name = str(body.name, 80)
    const phone = str(body.phone, 24)
    const phoneDigits = normalizePhone(phone)
    const model = str(body.model, 60)
    const yearRaw = str(body.year, 4)
    const details = str(body.details, 1000)
    const locale = body.locale === "ar" ? "ar" : "en"
    const brandRaw = str(body.brand, 60)
    const serviceRaw = str(body.service, 60)
    const formId = SLUG.test(str(body.formId, 60)) ? str(body.formId, 60) : "enquiry"

    const brand = brandRaw ? doc.brands.find((b) => b.slug === brandRaw && b.visible) : undefined
    const service = serviceRaw ? doc.services.find((s) => s.slug === serviceRaw && s.visible) : undefined
    if (brandRaw && !brand) errors.brand = "unknown"
    if (serviceRaw && !service) errors.service = "unknown"

    if (name.length < 2) errors.name = "required"
    if (phoneDigits.length < 7 || phoneDigits.length > 15) errors.phone = "invalid"
    let year: number | null = null
    if (yearRaw) {
      year = Number(yearRaw)
      const maxYear = new Date().getFullYear() + 1
      if (!Number.isInteger(year) || year < MIN_VEHICLE_YEAR || year > maxYear) errors.year = "out_of_range"
    }
    // A known service gives enough context; otherwise ask for a model or details.
    if (!service && !model && details.length < 5) errors.details = "required"
    if (Object.keys(errors).length) return reply(request, "invalid", 400, { fields: errors })

    if (await intakeIsDryRun()) return reply(request, "dry_run", 200, { id: null })

    // Retried submission: return the real persisted lead, no new alert.
    const existing = await findBySubmission(submissionId)
    if (existing) return reply(request, "duplicate", 200, { id: existing })

    const svc = createServiceClient()
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await svc
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>phone_digits", phoneDigits)
      .gte("created_at", since)
    if ((count ?? 0) >= 3) return reply(request, "rate_limited", 429)

    const a = (body.attribution && typeof body.attribution === "object" ? body.attribution : {}) as Record<string, unknown>
    const first = (a.first && typeof a.first === "object" ? a.first : a) as Record<string, unknown>
    const latest = (a.latest && typeof a.latest === "object" ? a.latest : a) as Record<string, unknown>

    const metadata = {
      kind: "website_enquiry",
      submission_id: submissionId,
      form_id: formId,
      locale,
      phone_digits: phoneDigits,
      brand_slug: brand?.slug ?? null,
      service_slug: service?.slug ?? null,
      vehicle_model: model || null,
      vehicle_year: year,
      submit_path: publicPath(body.submitPath),
      first_touch: attribution(first),
      latest_touch: attribution(latest),
    }

    const brandName = brand?.name.en ?? null
    const serviceName = service?.name.en ?? null
    const message = [
      brandName && `Brand: ${brandName}`,
      model && `Model: ${model}`,
      year && `Year: ${year}`,
      serviceName && `Service: ${serviceName}`,
      details && `Details: ${details}`,
    ]
      .filter(Boolean)
      .join("\n")

    const { data, error } = await createPublicClient().rpc("submit_lead", {
      p_name: name,
      p_phone: phone,
      p_email: null,
      p_message: message || null,
      p_service_interest: [brandName, serviceName].filter(Boolean).join(" · ") || null,
      p_source: "website",
      p_metadata: metadata,
    })

    if (error) {
      // Only a race on THIS submission id is a duplicate; everything else fails.
      if (error.code === "23505") {
        const raced = await findBySubmission(submissionId)
        if (raced) return reply(request, "duplicate", 200, { id: raced })
      }
      return reply(request, "error", 500)
    }
    if (!data?.ok || !data?.id) return reply(request, "error", 500)

    try {
      await notifyByPermission("leads.manage", {
        title: "New website enquiry",
        body: `${name} sent an enquiry${brandName ? ` about ${brandName}` : ""}${serviceName ? ` (${serviceName})` : ""}.`,
        type: "info",
        link: "/leads",
      })
    } catch {
      /* notification is best-effort */
    }

    return reply(request, "received", 200, { id: data.id })
  } catch {
    return reply(request, "error", 500)
  }
}
