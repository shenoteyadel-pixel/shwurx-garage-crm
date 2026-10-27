import { test } from "node:test"
import assert from "node:assert/strict"
import {
  advanceDueDate,
  cashRequirementAED,
  classifyFailure,
  containsSensitiveData,
  dubaiToday,
  dueState,
  grossCycleAED,
  monthlyCostAED,
  parseSubscriptionCsv,
  csvTemplate,
  reminderStage,
  type SubscriptionLike,
} from "../lib/subscriptions"

const base: SubscriptionLike = {
  amount: 100,
  currency: "AED",
  fx_rate_to_aed: 1,
  vat_rate: 5,
  amount_includes_vat: false,
  billing_cycle: "monthly",
  custom_cycle_days: null,
  next_due_date: "2026-11-30",
  status: "active",
  criticality: "high",
}

test("due dates advance with month-end clamping", () => {
  assert.equal(advanceDueDate("2026-01-31", "monthly", null), "2026-02-28")
  assert.equal(advanceDueDate("2026-11-30", "quarterly", null), "2027-02-28")
  assert.equal(advanceDueDate("2028-02-29", "yearly", null), "2029-02-28")
  assert.equal(advanceDueDate("2026-10-01", "custom", 10), "2026-10-11")
})

test("Dubai date rolls over at 20:00 UTC", () => {
  assert.equal(dubaiToday(new Date("2026-10-27T19:59:00Z")), "2026-10-27")
  assert.equal(dubaiToday(new Date("2026-10-27T20:00:00Z")), "2026-10-28")
})

test("costs include VAT and FX", () => {
  assert.equal(grossCycleAED(base), 105)
  assert.equal(grossCycleAED({ ...base, amount: 20, fx_rate_to_aed: 3.6725, vat_rate: 0 }), 73.45)
  assert.equal(monthlyCostAED({ ...base, billing_cycle: "yearly", amount: 1200, vat_rate: 0 }), 100)
})

test("due state covers every case", () => {
  assert.equal(dueState(base, "2026-12-01"), "overdue")
  assert.equal(dueState(base, "2026-11-30"), "due_today")
  assert.equal(dueState(base, "2026-11-10"), "due_soon")
  assert.equal(dueState(base, "2026-10-01"), "upcoming")
  assert.equal(dueState({ ...base, status: "paused" }, "2026-12-01"), "inactive")
  assert.equal(dueState({ ...base, resolved_due_date: "2026-11-30" }, "2026-12-05"), "resolved")
})

test("reminder stages catch up and escalate", () => {
  assert.equal(reminderStage(base, "2026-10-01"), null)
  assert.equal(reminderStage(base, "2026-10-31")?.stage, "d30")
  assert.equal(reminderStage(base, "2026-11-20")?.stage, "d14")
  assert.equal(reminderStage(base, "2026-11-29")?.stage, "d1")
  assert.deepEqual(reminderStage(base, "2026-11-30"), { stage: "due", escalated: false, daysUntil: 0 })
  assert.equal(reminderStage(base, "2026-12-01")?.escalated, false)
  assert.equal(reminderStage(base, "2026-12-03")?.escalated, true)
  assert.equal(reminderStage({ ...base, criticality: "critical" }, "2026-12-01")?.escalated, true)
  assert.equal(reminderStage({ ...base, resolved_due_date: "2026-11-30" }, "2026-12-01"), null)
})

test("cash requirement counts overdue and upcoming cycles", () => {
  assert.equal(cashRequirementAED([base], "2026-11-01", 30), 105)
  assert.equal(cashRequirementAED([{ ...base, next_due_date: "2026-10-20" }], "2026-11-01", 30), 210)
  assert.equal(cashRequirementAED([{ ...base, status: "cancelled" }], "2026-11-01", 30), 0)
})

test("sensitive data is detected without flagging card last-4", () => {
  assert.equal(containsSensitiveData("Visa 4111 1111 1111 1111"), true)
  assert.equal(containsSensitiveData("cvv: 123"), true)
  assert.equal(containsSensitiveData("Company Visa (last 4: 1234)"), false)
  assert.equal(containsSensitiveData("Invoice INV-2026-000123"), false)
})

test("CSV template round-trips and bad rows report errors", () => {
  const ok = parseSubscriptionCsv(csvTemplate())
  assert.equal(ok.headerError, undefined)
  assert.equal(ok.rows.length, 1)
  assert.equal(ok.rows[0].errors, undefined)
  assert.equal(ok.rows[0].value?.service_name, "Vercel Pro")

  const bad = parseSubscriptionCsv("service_name,next_due_date\n,2026-02-30")
  assert.ok(bad.rows[0].errors && bad.rows[0].errors.length > 0)
  assert.ok(parseSubscriptionCsv("name\nx").headerError)
})

test("failures linked to overdue subscriptions are flagged as suspected unpaid", () => {
  assert.equal(classifyFailure({ kind: "http", linkedSubscription: { ...base, next_due_date: "2026-10-01" }, today: "2026-10-27" }), "suspected_unpaid")
  assert.equal(classifyFailure({ kind: "http", linkedSubscription: base, today: "2026-10-27" }), "outage")
  assert.equal(classifyFailure({ kind: "backup", today: "2026-10-27" }), "stale")
})
