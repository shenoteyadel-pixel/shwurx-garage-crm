export type LeadOriginKind = "brand" | "service" | "contact" | "advisor" | "appointment" | "ad_form" | "other"

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
  { key: "ad_form", label: "Ad lead forms" },
  { key: "other", label: "Other" },
]

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}

/** Read the actual provider/website campaign fields; no names are inferred from vehicle text. */
export function leadCampaignName(metadata: unknown): string | null {
  const md = object(metadata)
  const firstUtm = object(object(md.first_touch).utm)
  const latestUtm = object(object(md.latest_touch).utm)
  return text(firstUtm.campaign) ?? text(latestUtm.campaign) ?? text(md.utm_campaign) ?? text(md.campaign) ?? text(md.campaign_name)
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-")
}

/** Derives where a lead came from using the metadata the public intake routes persist. */
export function leadOrigin(metadata: unknown, source?: string | null): LeadOrigin {
  const md = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  const path = text(md.submit_path) ?? text(md.page_path)
  const pageContext = text(md.page_context) ?? ""
  const brandSlug = text(md.brand_slug)
  const first = (md.first_touch && typeof md.first_touch === "object" ? md.first_touch : {}) as Record<string, unknown>
  const utm = (first.utm && typeof first.utm === "object" ? first.utm : {}) as Record<string, unknown>
  const latestUtm = object(object(md.latest_touch).utm)
  const campaignName = leadCampaignName(md)
  // A fallback campaign must retain its own source/medium; combining first-touch
  // organic source with a later paid campaign would falsely attribute that lead.
  const displayUtm = text(utm.campaign) ? utm
    : text(latestUtm.campaign) ? latestUtm
      : campaignName ? { source: md.utm_source, medium: md.utm_medium }
        : text(utm.source) || text(utm.medium) ? utm
          : text(latestUtm.source) || text(latestUtm.medium) ? latestUtm
            : { source: md.utm_source, medium: md.utm_medium }
  const campaign =
    [text(displayUtm.source), text(displayUtm.medium), campaignName]
      .filter(Boolean)
      .join(" · ") || null
  const year = typeof md.vehicle_year === "number" ? md.vehicle_year : null

  let kind: LeadOriginKind = "other"
  let label = source === "website" ? "Website" : "Origin not recorded"
  const brandMatch = path?.match(/^(?:\/ar)?\/brands\/([a-z0-9-]+)/)
  const serviceMatch = path?.match(/^(?:\/ar)?\/services\/([a-z0-9-]+)/)

  const metaForm = md.provider === "meta" || /^meta:/.test(text(md.external_id) ?? "")
  const googleForm = md.provider === "google" || /^google:/.test(text(md.external_id) ?? "")
  if (metaForm) {
    kind = "ad_form"
    label = source === "instagram" || md.platform === "ig" || md.platform === "instagram" ? "Instagram instant form" : "Facebook instant form"
  } else if (googleForm) {
    kind = "ad_form"
    label = "Google Ads lead form"
  } else if (md.kind === "ai_advisor") {
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
