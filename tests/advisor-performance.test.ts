import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_BUCKETS,
  attributeCollections,
  invoiceShares,
  lineCategory,
  normalizeBuckets,
  progressFor,
  reviewStats,
  sumAmounts,
  type InvoiceInput,
} from "../lib/advisor-performance"

const inv = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  id: "i1",
  job_id: "j1",
  advisor_id: "a1",
  status: "paid",
  total: 1050,
  discount: 0,
  upsell: 0,
  items: [
    { kind: "labour", line_total: 400 },
    { kind: "part", line_total: 400, part_source: "genuine" },
    { kind: "part", line_total: 200, part_source: "used" },
  ],
  ...over,
})

test("classifies lines into labour, new parts and used parts", () => {
  assert.equal(lineCategory({ kind: "labour", line_total: 1 }, DEFAULT_BUCKETS), "labour")
  assert.equal(lineCategory({ kind: "part", line_total: 1, part_source: "oem" }, DEFAULT_BUCKETS), "new_parts")
  assert.equal(lineCategory({ kind: "part", line_total: 1, part_source: "used" }, DEFAULT_BUCKETS), "used_parts")
  assert.equal(lineCategory({ kind: "part", line_total: 1 }, DEFAULT_BUCKETS), "new_parts")
  assert.equal(lineCategory({ kind: "fee", line_total: 1 }, DEFAULT_BUCKETS), null)
  assert.equal(lineCategory({ kind: "labour", line_total: 1, billing_type: "warranty" }, DEFAULT_BUCKETS), null)
})

test("classification is configurable", () => {
  const b = normalizeBuckets({ refurbished: "used", unclassified: "used", bogus: "x" })
  assert.equal(lineCategory({ kind: "part", line_total: 1, part_source: "refurbished" }, b), "used_parts")
  assert.equal(lineCategory({ kind: "part", line_total: 1 }, b), "used_parts")
})

test("full payment counts ex-VAT value once per category", () => {
  const rows = attributeCollections([inv()], [{ id: "p1", invoice_id: "i1", direction: "in", amount: 1050, paid_at: "2026-11-02T10:00:00Z" }], DEFAULT_BUCKETS)
  assert.deepEqual(sumAmounts(rows), { labour: 400, new_parts: 400, used_parts: 200 })
})

test("unpaid invoices count nothing; partial payments count pro rata", () => {
  assert.equal(attributeCollections([inv()], [], DEFAULT_BUCKETS).length, 0)
  const rows = attributeCollections([inv()], [{ id: "p1", invoice_id: "i1", direction: "in", amount: 525, paid_at: "2026-11-02" }], DEFAULT_BUCKETS)
  assert.deepEqual(sumAmounts(rows), { labour: 200, new_parts: 200, used_parts: 100 })
})

test("refunds reverse value and overpayments add nothing", () => {
  const rows = attributeCollections(
    [inv()],
    [
      { id: "p1", invoice_id: "i1", direction: "in", amount: 1200, paid_at: "2026-11-02" },
      { id: "p2", invoice_id: "i1", direction: "out", amount: 525, paid_at: "2026-11-05" },
    ],
    DEFAULT_BUCKETS,
  )
  assert.deepEqual(sumAmounts(rows), { labour: 200, new_parts: 200, used_parts: 100 })
  assert.equal(rows[1].day, "2026-11-05")
  assert.ok(rows[1].amounts.labour < 0)
})

test("cancelled invoices and duplicate payment rows are ignored", () => {
  const pay = { id: "p1", invoice_id: "i1", direction: "in" as const, amount: 1050, paid_at: "2026-11-02" }
  assert.equal(attributeCollections([inv({ status: "cancelled" })], [pay], DEFAULT_BUCKETS).length, 0)
  assert.equal(attributeCollections([inv()], [pay, pay], DEFAULT_BUCKETS).length, 1)
})

test("discount and add-on value are removed so add-ons are not double counted", () => {
  const s = invoiceShares(inv({ discount: 100, upsell: 100 }), DEFAULT_BUCKETS)
  assert.equal(Math.round(s.labour + s.new_parts + s.used_parts), 800)
})

test("commission is paid above target plus bonus once met", () => {
  assert.deepEqual(progressFor({ target: 1000, commission_percent: 10, bonus_amount: 50 }, 1500), {
    target: 1000, achieved: 1500, remaining: 0, percent: 150, commission: 100, met: true,
  })
  const short = progressFor({ target: 1000, commission_percent: 10, bonus_amount: 50 }, 600)
  assert.equal(short.commission, 0)
  assert.equal(short.remaining, 400)
  assert.equal(progressFor(undefined, 500).commission, 0)
})

test("review stats show coverage and verified conversion separately", () => {
  const s = reviewStats(10, [
    { status: "delivered", verified_at: "2026-11-03" },
    { status: "sent", verified_at: null },
    { status: "failed", verified_at: null },
    { status: "delivered", verified_at: null },
  ])
  assert.deepEqual(s, { eligibleJobs: 10, requested: 4, delivered: 2, verified: 1, coverage: 40, conversion: 25 })
})
