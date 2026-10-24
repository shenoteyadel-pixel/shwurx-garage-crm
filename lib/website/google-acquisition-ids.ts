/**
 * Dedicated Google acquisition identifiers retained with a CRM touch only.
 * They are not free-form UTM text and must never be projected into provider
 * telemetry. A numeric utm_campaign is an established ValueTrack campaign ID;
 * utm_content is NOT assumed to be an ad-group ID.
 */
const ID = /^[1-9][0-9]{0,19}$/
const CLICK = /^[A-Za-z0-9_-]{8,200}$/
const numericId = (value: unknown): string | null =>
  typeof value === "string" && ID.test(value) ? value : null

export function googleAcquisitionIds(touch: Record<string, unknown>) {
  const source = typeof touch.utm_source === "string" ? touch.utm_source.trim().toLowerCase() : ""
  const medium = typeof touch.utm_medium === "string" ? touch.utm_medium.trim().toLowerCase() : ""
  const paidGoogle = source === "google" && /^(cpc|ppc|paid|paid_search|paid-search|paid search)$/.test(medium)
  const googleClick = [touch.gclid, touch.gbraid, touch.wbraid].some((v) => typeof v === "string" && CLICK.test(v))
  if (!paidGoogle && !googleClick) return { campaign_id: null, adgroup_id: null }
  return {
    campaign_id: numericId(touch.campaign_id) ?? numericId(touch.campaignid) ?? numericId(touch.utm_campaign),
    adgroup_id: numericId(touch.adgroup_id) ?? numericId(touch.adgroupid),
  }
}
