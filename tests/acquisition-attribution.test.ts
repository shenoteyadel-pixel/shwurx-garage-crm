import assert from "node:assert/strict"
import test from "node:test"
import { computeAttribution } from "../lib/ai-marketing/attribution"
import { getGoogleLeadFunnel, leadGclid } from "../lib/ai-marketing/google-leads"
import { isExcludedAcquisitionLead, resolvePaidLeadAttribution } from "../lib/ai-marketing/lead-attribution"

// Synthetic fixtures only. No network, customer data or database writes.
const now = new Date(Date.now() - 60_000).toISOString()
const after = new Date().toISOString()
const googleTouch = { utm: { source: "google", medium: "cpc", campaign: "24324930475" }, click_ids: { gclid: "synthetic-gclid-123" } }
const metaTouch = { utm: { source: "facebook", medium: "paid_social", campaign: "synthetic-meta-campaign" } }
const lead = (id: string, metadata: Record<string, unknown>, source = "website", customer_id: string | null = null) => ({
  id, name: null, phone: null, email: null, source, status: "new", service_interest: null, customer_id, created_at: now, metadata,
})

function db(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? []
      const q = {
        select() { return q },
        in(key: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[key])); return q },
        gte(key: string, min: string) { rows = rows.filter((r) => String(r[key]) >= min); return q },
        is(key: string, value: unknown) { rows = rows.filter((r) => (r[key] ?? null) === value); return q },
        neq(key: string, value: unknown) { rows = rows.filter((r) => r[key] !== value); return q },
        or() { return q }, order() { return q }, limit() { return q },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
      }
      return q
    },
  } as any
}

test("root website touches resolve Google campaign and GCLID", () => {
  assert.equal(leadGclid({ first_touch: googleTouch, latest_touch: googleTouch }), "synthetic-gclid-123")
  assert.equal(resolvePaidLeadAttribution("website", { latest_touch: googleTouch })?.campaign, "24324930475")
})

test("nested appointment attribution resolves its first paid touch", () => {
  assert.equal(leadGclid({ attribution: { first_touch: googleTouch } }), "synthetic-gclid-123")
})

for (const key of ["gbraid", "wbraid"] as const) {
  test(`a ${key} website lead is attributed without inventing a GCLID`, () => {
    const a = resolvePaidLeadAttribution("website", { latest_touch: { click_ids: { [key]: "synthetic-braid-123" } } })
    assert.equal(a?.channel, "google")
    assert.equal(a?.[key], "synthetic-braid-123")
    assert.equal(a?.gclid, null)
  })
}

for (const metadata of [
  { gclid: "synthetic-gclid-123" },
  { click_ids: { gclid: "synthetic-gclid-123" } },
  { attribution: { click_ids: { gclid: "synthetic-gclid-123" } } },
  { attribution: { gclid: "synthetic-gclid-123" } },
]) {
  test(`legacy click shape remains supported: ${JSON.stringify(metadata)}`, () => {
    assert.equal(leadGclid(metadata), "synthetic-gclid-123")
  })
}

test("Google paid UTM works with no click ID, organic does not", () => {
  assert.equal(resolvePaidLeadAttribution("website", { latest_touch: { utm: { source: "google", medium: "cpc" } } })?.channel, "google")
  assert.equal(resolvePaidLeadAttribution("website", { utm_source: "google", utm_medium: "organic" }), null)
  assert.equal(resolvePaidLeadAttribution("website", {}), null)
})

test("latest paid Meta touch wins over earlier Google; click IDs are not blended", () => {
  const a = resolvePaidLeadAttribution("website", { first_touch: googleTouch, latest_touch: metaTouch })
  assert.equal(a?.channel, "meta")
  assert.equal(a?.campaign, "synthetic-meta-campaign")
  assert.equal(a?.gclid, null)
})

test("latest direct visit retains first paid evidence", () => {
  assert.equal(resolvePaidLeadAttribution("website", { first_touch: googleTouch, latest_touch: { utm: {} } })?.channel, "google")
})

test("native lead-form source retains its channel and stable campaign ID", () => {
  assert.equal(resolvePaidLeadAttribution("google_ads", { campaign_id: "24324930475", campaign: "Human name" })?.campaign, "24324930475")
  assert.equal(resolvePaidLeadAttribution("facebook", { first_touch: googleTouch })?.channel, "meta")
  assert.equal(resolvePaidLeadAttribution("google_ads", { attribution: { utm_campaign: "Legacy campaign" } })?.campaign, "Legacy campaign")
})

test("explicit test fixtures, organic and deleted entries are excluded, ordinary notes preserved", () => {
  for (const metadata of [{ test: true }, { is_test: true }, { test_lead: "true" }, { label: "TEST – EXCLUDE" }, { notes: "TEST - EXCLUDE" }, { organic: true }, { deleted_at: now }]) {
    assert.equal(isExcludedAcquisitionLead({ metadata }), true)
  }
  assert.equal(isExcludedAcquisitionLead({ name: "TEST — EXCLUDE", metadata: {} }), true)
  assert.equal(isExcludedAcquisitionLead({ metadata: { notes: "Customer requested diagnostic test", test: false } }), false)
})

test("Google funnel includes nested paid website leads and excludes all synthetic test rows", async () => {
  const rows = [
    lead("root", { latest_touch: googleTouch }),
    lead("nested", { attribution: { first_touch: googleTouch } }),
    lead("braid", { latest_touch: { click_ids: { wbraid: "synthetic-braid" } } }),
    lead("native", { campaign_id: "24324930475" }, "google_ads"),
    lead("test", { test: true }, "google_ads"),
    { ...lead("named-test", {}, "google_ads"), name: "TEST – EXCLUDE" },
    lead("organic", { utm_source: "google", utm_medium: "organic" }),
    lead("meta", { latest_touch: metaTouch }),
  ]
  const actual = await getGoogleLeadFunnel(db({ leads: rows }))
  assert.deepEqual(actual.map((r) => r.id), ["root", "nested", "braid", "native"])
  assert.equal(actual[0].campaign, "24324930475")
  assert.equal(actual[2].gclid, null)
})

test("overall attribution counts paid website leads by evidence and drops organic/tests", async () => {
  const report = await computeAttribution(db({ leads: [
    lead("web-google", { latest_touch: googleTouch }),
    lead("web-meta", { latest_touch: metaTouch }),
    lead("organic", { latest_touch: { utm: { source: "google", medium: "organic" } } }),
    lead("test", { test: true }, "google_ads"),
    { ...lead("named-test", {}, "facebook"), name: "TEST – EXCLUDE" },
  ] }), { google: 60, meta: 100 })
  assert.equal(report.channels.find((r) => r.channel === "google")?.leads, 1)
  assert.equal(report.channels.find((r) => r.channel === "meta")?.leads, 1)
  assert.deepEqual(report.campaigns.map((r) => r.campaign).sort(), ["24324930475", "synthetic-meta-campaign"].sort())
})

test("converted status is not paid revenue; invoice amount_paid remains required", async () => {
  const rows = [
    { ...lead("paid", { latest_touch: googleTouch }, "website", "customer-1"), status: "new" },
    { ...lead("unpaid", { latest_touch: googleTouch }, "website", "customer-2"), status: "converted" },
  ]
  const tables = {
    leads: rows,
    jobs: [
      { id: "job-1", customer_id: "customer-1", created_at: after, deleted_at: null },
      { id: "job-2", customer_id: "customer-2", created_at: after, deleted_at: null },
    ],
    invoices: [
      { job_id: "job-1", amount_paid: 20, status: "partial" },
      { job_id: "job-2", amount_paid: 0, status: "sent" },
    ],
  }
  const report = await computeAttribution(db(tables), { google: 60, meta: null })
  const google = report.channels.find((r) => r.channel === "google")!
  assert.equal(google.customers, 1)
  assert.equal(google.revenue, 20)
  const funnel = await getGoogleLeadFunnel(db(tables))
  assert.equal(funnel.find((r) => r.id === "paid")?.converted, true)
  assert.equal(funnel.find((r) => r.id === "unpaid")?.converted, false)
})
