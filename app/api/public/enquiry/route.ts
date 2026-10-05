import { cookies } from "next/headers"
import { createPublicClient } from "@/lib/supabase/public"
import { createServiceClient } from "@/lib/supabase/server"
import { preflight, jsonWithCors } from "@/lib/public-cors"
import { notifyByPermission } from "@/lib/actions-notifications"
import { getPublishedDocument, PREVIEW_COOKIE } from "@/lib/website/store"

export const runtime = "nodejs"

export function OPTIONS(request: Request) {
  return preflight(request)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9-]{1,60}$/
const MIN_FILL_MS = 2500

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""
}

function optStr(v: unknown, max: number): string | null {
  return str(v, max) || null
}

/**
 * Live persistence is only allowed on the production deployment. Previews and
 * local dev share the production database, so they validate fully but never
 * insert leads or notify staff (dry run), unless explicitly enabled.
 */
function liveIntake(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.WEBSITE_INTAKE_LIVE === "1"
}

/**
 * Contextual website enquiry. Validates and bounds every field, re-derives the
 * brand/service from the PUBLISHED website document, applies spam controls,
 * deduplicates retries by a stable client submission id, then writes through
 * the existing `submit_lead` pipeline. An enquiry is not a confirmed appointment.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const errors: Record<string, string> = {}

    // Spam controls: honeypot + minimum time on form.
    if (str(body.website, 200)) return jsonWithCors(request, { ok: true, id: null })
    const startedAt = Number(body.startedAt)
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
      return jsonWithCors(request, { ok: false, error: "too_fast" }, 400)
    }

    const submissionId = str(body.submissionId, 40)
    if (!UUID.test(submissionId)) return jsonWithCors(request, { ok: false, error: "bad_submission" }, 400)

    const name = str(body.name, 80)
    const phone = str(body.phone, 24)
    const phoneDigits = phone.replace(/\D/g, "")
    const model = str(body.model, 60)
    const yearRaw = str(body.year, 4)
    const details = str(body.details, 1000)
    const locale = body.locale === "ar" ? "ar" : "en"
    const brandSlug = SLUG.test(str(body.brand, 60)) ? str(body.brand, 60) : null
    const serviceSlug = SLUG.test(str(body.service, 60)) ? str(body.service, 60) : null
    const formId = SLUG.test(str(body.formId, 60)) ? str(body.formId, 60) : "enquiry"

    if (name.length < 2) errors.name = "required"
    if (phoneDigits.length < 7 || phoneDigits.length > 15) errors.phone = "invalid"
    const maxYear = new Date().getFullYear() + 1
    let year: number | null = null
    if (yearRaw) {
      year = Number(yearRaw)
      if (!Number.isInteger(year) || year < 1950 || year > maxYear) errors.year = "invalid"
    }
    if (!model && !details && !serviceSlug) errors.details = "required"
    if (Object.keys(errors).length) return jsonWithCors(request, { ok: false, error: "validation", fields: errors }, 400)

    // Editors previewing a draft never create real enquiries.
    const jar = await cookies()
    if (jar.get(PREVIEW_COOKIE)?.value) return jsonWithCors(request, { ok: true, id: null, preview: true })

    const doc = await getPublishedDocument()
    if (!doc.forms.enquiry.enabled) return jsonWithCors(request, { ok: false, error: "form_disabled" }, 403)
    const brand = brandSlug ? doc.brands.find((b) => b.slug === brandSlug && b.visible) : undefined
    const service = serviceSlug ? doc.services.find((s) => s.slug === serviceSlug && s.visible) : undefined

    const a = (body.attribution && typeof body.attribution === "object" ? body.attribution : {}) as Record<string, unknown>
    const path = (v: unknown) => {
      const p = str(v, 200)
      return p.startsWith("/") && !/^\/(track|approve|approval|customer-access|pay|portal)(\/|$)/.test(p) ? p : null
    }

    const metadata = {
      kind: "website_enquiry",
      submission_id: submissionId,
      form_id: formId,
      locale,
      brand_slug: brand?.slug ?? null,
      service_slug: service?.slug ?? null,
      vehicle_model: model || null,
      vehicle_year: year,
      landing_path: path(a.landingPath),
      submit_path: path(body.submitPath),
      referrer: optStr(a.referrer, 120),
      utm: {
        source: optStr(a.utm_source, 120),
        medium: optStr(a.utm_medium, 120),
        campaign: optStr(a.utm_campaign, 120),
        content: optStr(a.utm_content, 120),
        term: optStr(a.utm_term, 120),
      },
      click_ids: { gclid: optStr(a.gclid, 200), gbraid: optStr(a.gbraid, 200), wbraid: optStr(a.wbraid, 200) },
    }

    const svc = createServiceClient()
    const { data: existing } = await svc
      .from("leads")
      .select("id")
      .eq("metadata->>submission_id", submissionId)
      .maybeSingle()
    if (existing) return jsonWithCors(request, { ok: true, id: existing.id, duplicate: true })

    // Soft rate limit per phone number.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await svc
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", since)
    if ((count ?? 0) >= 3) return jsonWithCors(request, { ok: false, error: "rate_limited" }, 429)

    if (!liveIntake()) {
      return jsonWithCors(request, { ok: true, id: null, dryRun: true })
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

    const pub = createPublicClient()
    const { data, error } = await pub.rpc("submit_lead", {
      p_name: name,
      p_phone: phone,
      p_email: null,
      p_message: message || null,
      p_service_interest: [brandName, serviceName].filter(Boolean).join(" · ") || null,
      p_source: "website",
      p_metadata: metadata,
    })
    if (error) {
      if (error.code === "23505") return jsonWithCors(request, { ok: true, id: null, duplicate: true })
      return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
    }
    if (!data?.ok) return jsonWithCors(request, { ok: false, error: data?.error ?? "server_error" }, 400)

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

    return jsonWithCors(request, { ok: true, id: data.id })
  } catch {
    return jsonWithCors(request, { ok: false, error: "server_error" }, 500)
  }
}
