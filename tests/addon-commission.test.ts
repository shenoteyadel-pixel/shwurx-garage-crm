import { test } from "node:test"
import assert from "node:assert/strict"
import { computeLine, deriveCommission, paidRatio, canPayout, recommend } from "../lib/addon-commission"

const base = { quantity: 1, unitPrice: 150, unitCost: 35, unitExtraCost: 15, discount: 0, commissionPct: 25, commissionEligible: true }

test("commission is 25% of gross profit, excluding VAT", () => {
  const l = computeLine(base)
  assert.equal(l.netAmount, 150)
  assert.equal(l.directCost, 50)
  assert.equal(l.grossProfit, 100)
  assert.equal(l.commission, 25)
})

test("discount reduces profit and commission", () => {
  const l = computeLine({ ...base, discount: 30 })
  assert.equal(l.netAmount, 120)
  assert.equal(l.grossProfit, 70)
  assert.equal(l.commission, 17.5)
})

test("discount cannot exceed the original amount", () => {
  const l = computeLine({ ...base, discount: 999 })
  assert.equal(l.netAmount, 0)
  assert.equal(l.commission, 0)
})

test("negative-profit and ineligible lines earn nothing", () => {
  assert.equal(computeLine({ ...base, unitPrice: 40 }).commission, 0)
  assert.equal(computeLine({ ...base, commissionEligible: false }).commission, 0)
})

test("quantity multiplies price and cost", () => {
  const l = computeLine({ ...base, quantity: 2 })
  assert.equal(l.grossProfit, 200)
  assert.equal(l.commission, 50)
})

const line = computeLine(base)
const inv = (amountPaid: number, status = "unpaid") => ({ status, total: 315, amountPaid })

test("status walks the lifecycle", () => {
  const d = (saleStatus: any, invoice: any = null, hasLivePayout = false) =>
    deriveCommission({ saleStatus, line, invoice, hasLivePayout, policy: "proportional" }).status
  assert.equal(d("proposed"), "proposed")
  assert.equal(d("approved"), "customer_approved")
  assert.equal(d("completed"), "work_completed")
  assert.equal(d("completed", inv(0)), "invoiced")
  assert.equal(d("completed", inv(100)), "payment_pending")
  assert.equal(d("completed", inv(315, "paid")), "earned")
  assert.equal(d("completed", inv(315, "paid"), true), "paid")
  assert.equal(d("rejected"), "rejected")
  assert.equal(d("cancelled"), "reversed")
  assert.equal(d("completed", inv(315, "cancelled")), "reversed")
})

test("approved but not completed work never earns, even if paid", () => {
  const r = deriveCommission({ saleStatus: "approved", line, invoice: inv(315, "paid"), hasLivePayout: false, policy: "proportional" })
  assert.equal(r.earned, 0)
  assert.equal(r.pending, 25)
})

test("partial payment: proportional vs full_only", () => {
  const prop = deriveCommission({ saleStatus: "completed", line, invoice: inv(157.5), hasLivePayout: false, policy: "proportional" })
  assert.equal(prop.earned, 12.5)
  assert.equal(prop.pending, 12.5)
  const full = deriveCommission({ saleStatus: "completed", line, invoice: inv(157.5), hasLivePayout: false, policy: "full_only" })
  assert.equal(full.earned, 0)
  assert.equal(full.status, "payment_pending")
})

test("payouts are only allowed for fully earned commission", () => {
  const earned = deriveCommission({ saleStatus: "completed", line, invoice: inv(315, "paid"), hasLivePayout: false, policy: "proportional" })
  const partial = deriveCommission({ saleStatus: "completed", line, invoice: inv(100), hasLivePayout: false, policy: "proportional" })
  const paid = deriveCommission({ saleStatus: "completed", line, invoice: inv(315, "paid"), hasLivePayout: true, policy: "proportional" })
  const cancelled = deriveCommission({ saleStatus: "cancelled", line, invoice: inv(315, "paid"), hasLivePayout: false, policy: "proportional" })
  assert.equal(canPayout(earned), true)
  assert.equal(canPayout(partial), false)
  assert.equal(canPayout(paid), false)
  assert.equal(canPayout(cancelled), false)
})

test("paidRatio ignores cancelled invoices and caps overpayment", () => {
  assert.equal(paidRatio(inv(400), "proportional"), 1)
  assert.equal(paidRatio(inv(315, "cancelled"), "proportional"), 0)
  assert.equal(paidRatio(null, "proportional"), 0)
})

test("recommendations use history, mileage, make and inspection", () => {
  const now = new Date("2026-11-14")
  const r = (o: any) =>
    recommend({ mileage: 50000, jobMake: "Toyota", compatibleMakes: null, intervalKm: 20000, intervalMonths: 12, last: null, inspectionText: "", name: "Engine Oil Flush", now, ...o })
  assert.equal(r({ compatibleMakes: "BMW, Audi" }).level, "incompatible")
  assert.equal(r({ last: { mileage: 45000, date: "2026-09-01" } }).level, "recent")
  assert.equal(r({ last: { mileage: 20000, date: "2026-09-01" } }).level, "due")
  assert.equal(r({ last: { mileage: 49000, date: "2025-06-01" } }).level, "due")
  assert.equal(r({ inspectionText: "Oil looks sludgy, recommend flush" }).level, "flagged")
  assert.equal(r({ mileage: 5000 }).level, "ok")
})
