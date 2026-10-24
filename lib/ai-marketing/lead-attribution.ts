type RecordValue = Record<string, unknown>

export type PaidLeadAttribution = {
  channel: "google" | "meta"
  campaign: string | null
  adGroup: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
}

export const ACQUISITION_LEAD_SOURCES = ["facebook", "instagram", "google_ads", "website"] as const

const record = (v: unknown): RecordValue =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as RecordValue) : {}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
// Native Google lead-form webhooks may persist JSON numbers. Avoid rounding an
// unsafe integer into a different campaign; long IDs must arrive as strings.
const providerId = (v: unknown) => typeof v === "number"
  ? Number.isSafeInteger(v) && v > 0 ? String(v) : null
  : typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v) ? v : null
const isTrue = (v: unknown) => v === true || v === "true"
const TEST_MARKER = /\bTEST\s*[-–—]\s*EXCLUDE\b/i

/** Exclude explicit fixtures from reporting without changing any CRM records. */
export function isExcludedAcquisitionLead(lead: { name?: string | null; metadata: RecordValue | null }) {
  const m = record(lead.metadata)
  return Boolean(
    m.deleted_at || isTrue(m.organic) || isTrue(m.test) || isTrue(m.is_test) || isTrue(m.test_lead) ||
    [lead.name, m.label, m.test_marker, m.note, m.notes, m.status].some((v) => typeof v === "string" && TEST_MARKER.test(v)),
  )
}

function touch(v: unknown) {
  const t = record(v)
  const utm = record(t.utm)
  const clicks = record(t.click_ids)
  const source = (str(t.utm_source) ?? str(utm.source))?.toLowerCase() ?? null
  const medium = (str(t.utm_medium) ?? str(utm.medium))?.toLowerCase() ?? null
  const gclid = str(t.gclid) ?? str(clicks.gclid)
  const gbraid = str(t.gbraid) ?? str(clicks.gbraid)
  const wbraid = str(t.wbraid) ?? str(clicks.wbraid)
  const paidMedium = medium !== null && /^(?:cpc|ppc|paid(?:[_ -]?(?:search|social))?|(?:search|social)[_ -]?paid)$/i.test(medium)
  let channel: PaidLeadAttribution["channel"] | null = null
  if (gclid || gbraid || wbraid || (source === "google" && paidMedium)) channel = "google"
  else if (source && ["facebook", "instagram", "meta", "fb", "ig"].includes(source) && paidMedium) channel = "meta"
  return {
    channel,
    campaign: providerId(t.campaign_id) ?? str(t.utm_campaign) ?? str(utm.campaign) ?? str(t.campaign),
    adGroup: providerId(t.adgroup_id),
    gclid, gbraid, wbraid,
  }
}

/**
 * Resolve the latest documented paid touch, falling back to the first paid touch.
 * Keep each touch together: never borrow a Google click ID from a different Meta touch.
 * Native lead-form sources keep their verified channel; website source alone proves no ad.
 */
export function resolvePaidLeadAttribution(source: string, metadata: RecordValue | null): PaidLeadAttribution | null {
  const m = record(metadata)
  const a = record(m.attribution)
  const native = source === "google_ads" ? "google" : ["facebook", "instagram"].includes(source) ? "meta" : null
  const touches = [m.latest_touch, a.latest_touch, m.first_touch, a.first_touch, a, m].map(touch)
  const selected = touches.find((t) => t.channel !== null && (!native || t.channel === native))
  const channel = native ?? selected?.channel
  if (!channel) return null
  return {
    channel,
    campaign: selected?.campaign ?? providerId(m.campaign_id) ?? str(m.campaign) ?? (native ? touches.find((t) => t.channel === null && t.campaign)?.campaign : null) ?? null,
    adGroup: selected?.adGroup ?? (native === "google" ? providerId(m.adgroup_id) : null) ?? null,
    gclid: channel === "google" ? selected?.gclid ?? null : null,
    gbraid: channel === "google" ? selected?.gbraid ?? null : null,
    wbraid: channel === "google" ? selected?.wbraid ?? null : null,
  }
}
