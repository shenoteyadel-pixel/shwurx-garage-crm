import { test } from "node:test"
import assert from "node:assert/strict"
import { seedDocument } from "@/lib/website/seed"
import { normalizeDocument, validateDocument } from "@/lib/website/normalize"
import { appointmentAvailable, appointmentRequestIssue, appointmentServices, isAppointmentPath } from "@/lib/website/appointment"
import { buildInventory } from "@/lib/website/inventory"

test("old saved documents receive booking defaults and retain original dictionary overrides", () => {
  const raw = JSON.parse(JSON.stringify(seedDocument()))
  delete raw.pages.appointment
  delete raw.forms.appointment
  raw.strings.en = { appointmentPage: { title: "Owner title" }, appointmentForm: { submit: "Owner submit" } }
  raw.strings.ar = { appointmentPage: { title: "عنوان المالك" } }
  const doc = normalizeDocument(raw)
  assert.equal(doc.pages.appointment.visible, true)
  assert.equal(doc.pages.appointment.title.en, "Owner title")
  assert.equal(doc.pages.appointment.title.ar, "عنوان المالك")
  assert.equal(doc.forms.appointment.copy.en.submit, "Owner submit")
  assert.equal(appointmentAvailable(doc), true)
})

test("explicit off flags, cleared text and empty arrays survive round trips", () => {
  const doc = seedDocument()
  doc.pages.appointment.visible = false
  doc.pages.appointment.points = []
  doc.pages.appointment.badge = { en: "", ar: "" }
  doc.forms.appointment.enabled = false
  doc.forms.appointment.serviceSlugs = []
  doc.forms.appointment.copy.ar.doneTitle = ""
  doc.forms.appointment.optionalFields.email = false
  const saved = normalizeDocument(normalizeDocument(doc))
  assert.deepEqual(saved.pages.appointment, doc.pages.appointment)
  assert.deepEqual(saved.forms.appointment, doc.forms.appointment)
  assert.equal(appointmentAvailable(saved), false)
})

test("legacy invalid copy values cannot corrupt typed form rendering", () => {
  const raw = JSON.parse(JSON.stringify(seedDocument()))
  delete raw.pages.appointment
  delete raw.forms.appointment
  raw.strings.en = { appointmentPage: { points: null }, appointmentForm: { types: 10, phone: [] } }
  const doc = normalizeDocument(raw)
  assert.equal(typeof doc.forms.appointment.copy.en.phone, "string")
  assert.equal(typeof doc.forms.appointment.copy.en.types.dropoff.label, "string")
  assert.ok(doc.pages.appointment.points.length)
})

test("only published configuration passed to the request guard governs public availability", () => {
  const live = seedDocument(), draft = structuredClone(live)
  draft.forms.appointment.enabled = false
  assert.equal(appointmentRequestIssue(live, {}), null)
  assert.equal(appointmentRequestIssue(draft, {}), "booking_unavailable")
  live.pages.appointment.visible = false
  assert.equal(appointmentRequestIssue(live, {}), "booking_unavailable")
})

test("public booking choices use configured visible services and stable booking type identifiers", () => {
  const doc = seedDocument()
  doc.forms.appointment.modes.pickup = false
  assert.equal(appointmentRequestIssue(doc, { metadata: { logistics: { type: "pickup" } } }), "booking_type_unavailable")
  assert.equal(appointmentRequestIssue(doc, { metadata: { logistics: { type: "pickup_delivery" } } }), null)
  assert.equal(appointmentRequestIssue(doc, { metadata: { logistics: { type: "invented" } } }), "booking_type_unavailable")
  const service = appointmentServices(doc)[0]
  assert.equal(appointmentRequestIssue(doc, { serviceInterest: service.name.en }), null)
  service.visible = false
  assert.equal(appointmentRequestIssue(doc, { serviceInterest: service.name.en }), "service_unavailable")
  doc.forms.appointment.allowOther = false
  assert.equal(appointmentRequestIssue(doc, { serviceInterest: "Other" }), "service_unavailable")
  doc.forms.appointment.serviceSlugs = []
  assert.deepEqual(appointmentServices(doc), [])
})

test("enabled form with no request types cannot be published", () => {
  const doc = seedDocument()
  doc.forms.appointment.modes = { dropoff: false, pickup: false, pickup_delivery: false }
  assert.ok(validateDocument(doc).some((i) => i.level === "error" && i.where === "Appointment form"))
  assert.equal(appointmentAvailable(doc), false)
})

test("Overview reflects draft/live differences and has page and form deep-links", () => {
  const live = seedDocument(), doc = structuredClone(live)
  doc.pages.appointment.title.ar = "عنوان معدل"
  doc.forms.appointment.enabled = false
  const items = buildInventory(doc, live, [])
  const page = items.find((r) => r.key === "page:appointment")!
  const form = items.find((r) => r.key === "form:appointment")!
  assert.equal(page.changed, true)
  assert.equal(page.status, "published")
  assert.equal(form.status, "hidden")
  assert.deepEqual(form.edit, { kind: "builder", section: "form", recordId: "appointment-form" })
  assert.equal(isAppointmentPath("/appointment?source=home"), true)
  assert.equal(isAppointmentPath("/ar/appointment#form"), true)
  assert.equal(isAppointmentPath("/appointment-other"), false)
})
