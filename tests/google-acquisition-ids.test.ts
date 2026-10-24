import assert from "node:assert/strict"
import test from "node:test"
import { googleAcquisitionIds } from "../lib/website/google-acquisition-ids"
import { sanitizeTouch } from "../lib/website/intake-attribution"
import { resolvePaidLeadAttribution } from "../lib/ai-marketing/lead-attribution"
import { parseTrackBody } from "../lib/website/track-intake"

const context = { utm_source: "google", utm_medium: "cpc" }
const ids = { campaign_id: "24324930475", adgroup_id: "201689562398" }

test("dedicated ValueTrack IDs survive CRM sanitization and reporting as one touch", () => {
  const stored = sanitizeTouch({ ...context, ...ids, utm_campaign: ids.campaign_id })
  assert.equal(stored.campaign_id, ids.campaign_id)
  assert.equal(stored.adgroup_id, ids.adgroup_id)
  assert.equal(stored.utm.campaign, null, "free-form UTM phone protection is unchanged")
  const actual = resolvePaidLeadAttribution("website", { latest_touch: stored })!
  assert.equal(actual.channel, "google")
  assert.equal(actual.campaign, ids.campaign_id)
  assert.equal(actual.adGroup, ids.adgroup_id)
})

test("numeric campaign UTM is recovered only with same-touch Google paid evidence", () => {
  assert.equal(googleAcquisitionIds({ ...context, utm_campaign: ids.campaign_id }).campaign_id, ids.campaign_id)
  for (const ctx of [{}, { utm_source: "google", utm_medium: "organic" }, { utm_source: "meta", utm_medium: "cpc" }]) {
    assert.deepEqual(googleAcquisitionIds({ ...ctx, ...ids }), { campaign_id: null, adgroup_id: null })
  }
})

test("explicit aliases and Google click evidence work without assuming utm_content is an ad group", () => {
  assert.deepEqual(googleAcquisitionIds({ gbraid: "synthetic-braid-123", campaignid: ids.campaign_id, adgroupid: ids.adgroup_id }), ids)
  assert.equal(googleAcquisitionIds({ ...context, utm_content: ids.adgroup_id }).adgroup_id, null)
})

test("identifier validation rejects formatting, tokens, numbers with precision loss, and overlong input", () => {
  for (const unsafe of ["", "0", "01234", "+971501234567", "050-123-4567", "٠٥٠١٢٣٤٥٦٧", "synthetic@example.test", "https://private.test", "{campaignid}", "123\n", "1".repeat(21), 24324930475]) {
    assert.deepEqual(googleAcquisitionIds({ ...context, campaign_id: unsafe, adgroup_id: unsafe }), { campaign_id: null, adgroup_id: null }, String(unsafe))
  }
})

test("latest paid touch never borrows earlier campaign or ad group", () => {
  const actual = resolvePaidLeadAttribution("website", {
    first_touch: sanitizeTouch({ ...context, ...ids }),
    latest_touch: sanitizeTouch({ ...context, campaign_id: "24324930478" }),
  })!
  assert.equal(actual.campaign, "24324930478")
  assert.equal(actual.adGroup, null)
})

test("public browser telemetry cannot assert a received conversation or connected call", () => {
  for (const eventType of ["call_connected", "whatsapp_received", "whatsapp_sent", "qualified_lead", "sale"]) {
    assert.deepEqual(parseTrackBody({ eventType, pagePath: "/contact" }, "test"), { ok: false, error: "unknown_event" })
  }
  for (const eventType of ["phone_click", "whatsapp_click"]) {
    const actual = parseTrackBody({ eventType, pagePath: "/contact" }, "test")
    assert.equal(actual.ok, true)
    if (actual.ok) assert.equal(actual.record.eventType, eventType)
  }
})

test("native Google webhook numeric IDs remain exact; unsafe integers are not rounded", () => {
  const actual = resolvePaidLeadAttribution("google_ads", { campaign_id: 24324930475, adgroup_id: 201689562398 })!
  assert.equal(actual.campaign, ids.campaign_id)
  assert.equal(actual.adGroup, ids.adgroup_id)
  assert.equal(resolvePaidLeadAttribution("google_ads", { campaign_id: Number.MAX_SAFE_INTEGER + 1 })!.campaign, null)
})
