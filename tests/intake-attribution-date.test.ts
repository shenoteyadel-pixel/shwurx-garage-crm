import { test } from "node:test"
import assert from "node:assert/strict"
import { sanitizeAttribution, sanitizeTouch } from "../lib/website/intake-attribution"

const retained = [
  "tracking_acceptance_20261009", "spring_sale_20260510", "حملة_٢٠٢٦١٠٠٩", "حملة_۲۰۲۶۱۰۰۹",
  "leap_20240229", "millennium_20000229", "spring-sale-20260510", "sale 20261009", "sale|20261009",
  "20261009_sale", "shwurx_porsche_search", "Porsche 911 Service | Q2",
]
const rejected = [
  "12345678", "+12345678", "20261009", "+20261009", "sale_12345678", "sale_20260230",
  "sale_20261301", "sale_20261000", "sale_20261032", "sale_20250229", "sale_19991231",
  "sale_21000101", "sale20261009", "sale_20261009x", "sale.20261009", "sale_(20261009)",
  "sale_+20261009", "sale_20261009_+12345678", "12 34 56 78", "+12 34 56 78", "١٢٣٤٥٦٧٨",
  "۱۲۳۴۵۶۷۸", "20 26 10 09", "sale_20-26-10-09", "sale_20261009 12 34 56 78",
  "%31%32%33%34%35%36%37%38", "+971501234567", "050-123-4567", "٠٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷",
  "synthetic@example.test", "synthetic%40example.test", "tel:12345678", "https://private.test/path", "www.private.test",
]
const now = Date.UTC(2026, 9, 16)
const touch = {
  at: new Date(now).toISOString(), utm_source: "nexscalex_qa", utm_medium: "qa",
  landingPath: "/brands/porsche?private=strip", referrer: "https://example.test/private?strip=1",
  gclid: "Cj0KCQjw_FIXTURE123",
}

for (const campaign of retained) {
  test(`retain a named valid date or ordinary campaign: ${campaign}`, () => {
    assert.equal(sanitizeTouch({ ...touch, utm_campaign: campaign }, now).utm.campaign, campaign)
  })
}
for (const campaign of rejected) {
  test(`reject contact-like or invalid/bare date campaign: ${campaign}`, () => {
    assert.equal(sanitizeTouch({ ...touch, utm_campaign: campaign }, now).utm.campaign, null)
  })
}

test("date exception is limited to utm_campaign, not other UTM fields", () => {
  const result = sanitizeTouch({
    ...touch, utm_source: "source_20261009", utm_medium: "medium_20261009",
    utm_campaign: "tracking_acceptance_20261009", utm_content: "content_20261009", utm_term: "term_20261009",
  }, now)
  assert.equal(result.utm.campaign, "tracking_acceptance_20261009")
  for (const key of ["source", "medium", "content", "term"] as const) assert.equal(result.utm[key], null, key)
})

test("first/latest preserve safe campaign, source, medium, click id, public path and referrer origin", () => {
  const result = sanitizeAttribution({ attribution: {
    first: { ...touch, utm_campaign: "tracking_acceptance_20261009" },
    latest: { ...touch, utm_campaign: "حملة_٢٠٢٦١٠٠٩" },
  } }, now)
  assert.equal(result.version, 4)
  assert.equal(result.first_touch.utm.campaign, "tracking_acceptance_20261009")
  assert.equal(result.latest_touch.utm.campaign, "حملة_٢٠٢٦١٠٠٩")
  for (const item of [result.first_touch, result.latest_touch]) {
    assert.equal(item.utm.source, "nexscalex_qa")
    assert.equal(item.utm.medium, "qa")
    assert.equal(item.click_ids.gclid, touch.gclid)
    assert.equal(item.landing_path, "/brands/porsche")
    assert.equal(item.referrer, "https://example.test")
    assert.equal(item.at, touch.at)
  }
  assert.equal(sanitizeTouch({ ...touch, landingPath: "/privacy-policy?secret=strip" }, now).landing_path, "/privacy-policy")
})
