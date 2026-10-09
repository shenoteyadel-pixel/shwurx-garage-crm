export type LeadOriginKind = "brand" | "service" | "contact" | "advisor" | "appointment" | "other"

export interface LeadOrigin {
  kind: LeadOriginKind
  label: string
  path: string | null
  brandSlug: string | null
  model: string | null
  year: number | null
  campaign: string | null
  referrer: string | null
  landingPath: string | null
}

export const ORIGIN_FILTERS: { key: "all" | LeadOriginKind; label: string }[] = [
  { key: "all", label: "All origins" },
  { key: "brand", label: "Brand pages" },
  { key: "service", label: "Service pages" },
  { key: "contact", label: "Contact page" },
  { key: "advisor", label: "AI advisor" },
  { key: "other", label: "Other" },
]

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-")
}

/** Derives where a lead came from using the metadata the public intake routes persist. */
export function leadOrigin(metadata: unknown): LeadOrigin {
  const md = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  const path = text(md.submit_path) ?? text(md.page_path)
  const pageContext = text(md.page_context) ?? ""
  const brandSlug = text(md.brand_slug)
  const first = (md.first_touch && typeof md.first_touch === "object" ? md.first_touch : {}) as Record<string, unknown>
  const utm = (first.utm && typeof first.utm === "object" ? first.utm : {}) as Record<string, unknown>
  const campaign =
    [text(utm.source) ?? text(md.utm_source), text(utm.medium) ?? text(md.utm_medium), text(utm.campaign) ?? text(md.utm_campaign)]
      .filter(Boolean)
      .join(" · ") || null
  const year = typeof md.vehicle_year === "number" ? md.vehicle_year : null

  let kind: LeadOriginKind = "other"
  let label = "Website"
  const brandMatch = path?.match(/^(?:\/ar)?\/brands\/([a-z0-9-]+)/)
  const serviceMatch = path?.match(/^(?:\/ar)?\/services\/([a-z0-9-]+)/)

  if (md.kind === "ai_advisor") {
    kind = "advisor"
    label = "AI service advisor"
  } else if (md.kind === "appointment" || /\/appointment/.test(path ?? "")) {
    kind = "appointment"
    label = "Appointment request"
  } else if (pageContext.startsWith("brand-") || brandMatch) {
    kind = "brand"
    label = `${titleFromSlug(brandMatch?.[1] ?? pageContext.replace(/^brand-/, ""))} brand page`
  } else if (pageContext.startsWith("service-") || serviceMatch) {
    kind = "service"
    label = `${titleFromSlug(serviceMatch?.[1] ?? pageContext.replace(/^service-/, ""))} service page`
  } else if (/^(?:\/ar)?\/contact/.test(path ?? "") || md.form_key === "contact") {
    kind = "contact"
    label = "Contact page"
  } else if (path) {
    label = path === "/" || path === "/ar" ? "Home page" : `Page ${path}`
  }

  return {
    kind,
    label,
    path,
    brandSlug,
    model: text(md.vehicle_model),
    year,
    campaign,
    referrer: text(first.referrer) ?? text(md.referrer),
    landingPath: text(first.landing_path),
  }
}
