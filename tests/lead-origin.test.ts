import { test } from "node:test"
import assert from "node:assert/strict"
import { leadCampaignName, leadOrigin, ORIGIN_FILTERS } from "../lib/lead-origin"
import { leadsToCsv } from "../lib/lead-source"
import type { LeadRow } from "../lib/actions-leads"

test("Meta imported lead shows its actual form origin and stored campaign", () => {
  const md = { provider: "meta", platform: "ig", campaign: "Luxury repair leads", form_id: "form-1" }
  const before = JSON.stringify(md)
  const origin = leadOrigin(md, "instagram")
  assert.equal(origin.kind, "ad_form")
  assert.equal(origin.label, "Instagram instant form")
  assert.equal(origin.campaign, "Luxury repair leads")
  assert.equal(origin.path, null)
  assert.equal(JSON.stringify(md), before, "display must not rewrite the persisted lead")
  assert.ok(ORIGIN_FILTERS.some(f => f.key === "ad_form"))
})

test("Facebook and Google lead forms are not labelled Website", () => {
  assert.equal(leadOrigin({ provider: "meta", platform: "fb" }, "facebook").label, "Facebook instant form")
  assert.equal(leadOrigin({ external_id: "meta:123" }, "instagram").label, "Instagram instant form")
  assert.equal(leadOrigin({ provider: "google", campaign: "campaign-1" }, "google_ads").label, "Google Ads lead form")
})

test("website paid visit stays a website page origin, not an instant form", () => {
  const origin = leadOrigin({
    submit_path: "/ar/brands/bentley", brand_slug: "bentley", vehicle_model: "Bentayga", vehicle_year: 2018,
    first_touch: { utm: { source: "google", medium: "cpc", campaign: "bentley_search" } },
  }, "website")
  assert.equal(origin.kind, "brand")
  assert.equal(origin.label, "Bentley brand page")
  assert.equal(origin.campaign, "google · cpc · bentley_search")
  assert.equal(origin.model, "Bentayga")
})

test("unknown source without metadata is not falsely attributed to the website", () => {
  assert.equal(leadOrigin(null).label, "Origin not recorded")
  assert.equal(leadOrigin({}, "website").label, "Website")
  assert.equal(leadOrigin({}, "facebook").kind, "other", "source alone cannot prove an instant form")
})

test("later paid campaign never borrows an earlier organic source and medium", () => {
  const md = {
    first_touch: { utm: { source: "google", medium: "organic", campaign: null } },
    latest_touch: { utm: { source: "facebook", medium: "cpc", campaign: "Bentley paid" } },
  }
  assert.equal(leadOrigin(md, "website").campaign, "facebook · cpc · Bentley paid")
  assert.equal(leadOrigin({ ...md, first_touch: { utm: { source: "google", medium: "cpc", campaign: "first paid" } } }, "website").campaign, "google · cpc · first paid")
  assert.equal(leadOrigin({ first_touch: md.first_touch, campaign: "Provider campaign" }, "facebook").campaign, "Provider campaign")
})

test("campaign export reads Meta, first/latest website and legacy values", () => {
  for (const [md, expected] of [
    [{ provider: "meta", campaign: "Porsche, Bentley" }, "Porsche, Bentley"],
    [{ first_touch: { utm: { campaign: "first" } }, latest_touch: { utm: { campaign: "latest" } } }, "first"],
    [{ first_touch: { utm: {} }, latest_touch: { utm: { campaign: "latest" } } }, "latest"],
    [{ utm_campaign: "legacy" }, "legacy"],
    [{ campaign_name: "old-import" }, "old-import"],
  ] as const) {
    assert.equal(leadCampaignName(md), expected)
    const csv = leadsToCsv([{ id: "test-1", name: "Test", status: "new", metadata: md } as unknown as LeadRow])
    assert.ok(csv.includes(expected))
  }
})

test("export keeps spreadsheet formula protection for provider campaign text", () => {
  const csv = leadsToCsv([{ id: "test-1", name: "Test", status: "new", metadata: { campaign: "=1+1" } } as unknown as LeadRow])
  assert.ok(csv.includes("'=1+1"))
})
