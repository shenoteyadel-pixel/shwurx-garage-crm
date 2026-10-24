import { test } from "node:test"
import assert from "node:assert/strict"
import { validateManualLead, manualLeadStatus } from "../lib/manual-lead"
import { resolvePaidLeadAttribution } from "../lib/ai-marketing/lead-attribution"
import { leadOrigin, leadCampaignName } from "../lib/lead-origin"
import { leadSourceKey } from "../lib/lead-source"

const now = new Date("2026-10-24T12:00:00Z")
const valid = () => ({ submissionId: "9dc07ec2-95e6-4195-b450-0a7b58799db2", name: "TEST - EXCLUDE", phone: "+12025550145", channel: "whatsapp", make: "Porsche", model: "Cayenne", year: "2020", fault: "Engine overheating", reportedSource: "google_ads", sourceDetail: "Customer said Google", contactResult: "received", followUpResult: "pending", occurredAt: "2026-10-24T15:00:00+04:00", evidence: "Incoming message seen in company inbox at 15:00 Dubai.", qualification: "", nextAction: "" })

test("received WhatsApp and missed phone stay New; actual two-way/answered evidence permits Contacted", () => {
  for (const [channel, contactResult, status] of [["whatsapp", "received", "new"], ["phone", "missed", "new"], ["whatsapp", "conversation", "contacted"], ["phone", "answered", "contacted"]]) {
    const r = validateManualLead({ ...valid(), channel, contactResult }, now)
    assert.ok(r.ok)
    assert.equal(manualLeadStatus(r.value), status)
  }
})
test("qualification requires connected evidence, make/model/year/fault and explicit reason", () => {
  const qualified = { ...valid(), contactResult: "conversation", followUpResult: "qualified", qualification: "Confirmed repair intent and workshop visit; major engine fault." }
  for (const patch of [{ contactResult: "received" }, { make: "" }, { model: "" }, { year: "" }, { fault: "" }, { qualification: "yes" }]) {
    assert.equal(validateManualLead({ ...qualified, ...patch }, now).ok, false)
  }
  const r = validateManualLead(qualified, now); assert.ok(r.ok); assert.equal(manualLeadStatus(r.value), "qualified")
})
test("rejects malformed input, unreasonable times, wrong channel/result, bad phone and overlength text", () => {
  for (const patch of [{ phone: "+12025550145 email@example.com" }, { phone: "1".repeat(25) }, { name: "x".repeat(161) }, { channel: "email" }, { contactResult: "answered" }, { followUpResult: "paid" }, { occurredAt: "2026-10-25T12:00:00Z" }, { occurredAt: "" }, { evidence: "" }, { year: "20200" }, { submissionId: "123" }, { followUpResult: "follow_up", nextAction: "" }]) {
    assert.equal(validateManualLead({ ...valid(), ...patch }, now).ok, false, JSON.stringify(patch))
  }
})
test("Arabic digits normalize; old unsuitable vehicles can be recorded without claiming quality", () => {
  const r = validateManualLead({ ...valid(), phone: "٠٥٠١٢٣٤٥٦٧", year: "٢٠١٤", followUpResult: "not_suitable", qualification: "Outside target repair scope" }, now)
  assert.ok(r.ok); assert.equal(r.value.phone, "+971501234567"); assert.equal(r.value.year, 2014); assert.equal(manualLeadStatus(r.value), "lost")
})
test("Lost requires a rejection reason and invalid calendar dates never normalize silently", () => {
  assert.equal(validateManualLead({ ...valid(), followUpResult: "not_suitable", qualification: "" }, now).ok, false)
  assert.equal(validateManualLead({ ...valid(), occurredAt: "2026-02-30T12:00:00+04:00" }, now).ok, false)
  assert.equal(validateManualLead({ ...valid(), occurredAt: "2026-10-23T24:00:00+04:00" }, now).ok, false)
})
test("untrusted paid IDs/status/customer metadata are not accepted into manual intake", () => {
  const r = validateManualLead({ ...valid(), status: "converted", customer_id: "someone", utm_source: "google", gclid: "fake-click", metadata: { campaign_id: "123" } }, now)
  assert.ok(r.ok)
  for (const key of ["status", "customer_id", "utm_source", "gclid", "metadata"]) assert.equal(key in r.value, false)
})
test("manual source never becomes verified ad attribution even with injected legacy paid metadata", () => {
  for (const source of ["manual_whatsapp", "manual_phone"]) {
    const metadata = { kind: "manual_contact", reported_source: "google_ads", gclid: "fake", campaign_id: "123", utm_campaign: "fake campaign", vehicle_make: "Porsche", vehicle_model: "Cayenne", vehicle_year: 2020 }
    assert.equal(resolvePaidLeadAttribution(source, metadata), null)
    assert.equal(leadSourceKey(source), "manual")
    assert.equal(leadCampaignName(metadata), null)
    assert.equal(leadOrigin(metadata, source).campaign, null)
    assert.equal(leadOrigin(metadata, source).path, null)
  }
})
