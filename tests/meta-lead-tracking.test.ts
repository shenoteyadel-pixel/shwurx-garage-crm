import { test, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import * as bus from "../lib/site-track"
import { bootstrap } from "../components/site-tracking"
import { resolveRuntime, SEED_ANALYTICS } from "../lib/website/analytics"

// Synthetic fixture only: production obtains the pixel from its published configuration.
const PIXEL = "123456789012345"
class Storage {
  values = new Map<string, string>()
  getItem(k: string) { return this.values.get(k) ?? null }
  setItem(k: string, v: string) { this.values.set(k, v) }
  removeItem(k: string) { this.values.delete(k) }
}
let win: any, local: Storage, calls: unknown[][], google: unknown[][], token: string
let serial = 0
const leads = () => calls.filter(c => c[0] === "trackSingle" && c[2] === "Lead")
function ready() {
  win.__shwurxMetaPixelId = PIXEL
  win.fbq = (...args: unknown[]) => calls.push(args)
}
function emit(id = "saved-record") {
  bus.emitConversion(id, { form: "enquiry", outcome: "lead", token, brand: "bentley", service: "mechanical" })
}
beforeEach(() => {
  local = new Storage(); calls = []; google = []
  token = `MetaTokenFixture${String(++serial).padStart(16, "0")}`
  assert.equal(token.length, 32)
  const config = structuredClone(SEED_ANALYTICS)
  win = {
    location: { pathname: "/brands/bentley", origin: "https://www.swurxauto.com", search: "" },
    localStorage: local, sessionStorage: new Storage(), dataLayer: [],
    __shwurxTrack: true, __shwurxThirdParty: true, __shwurxTagMode: "none",
    __shwurxConsentNeeded: true, __shwurxConsent: { analytics: false, ads: true },
    __shwurxConsentEpoch: 0,
    __shwurxTags: { ...config, metaPixelId: PIXEL },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id),
    dispatchEvent: () => true,
    __shwurxPublicRuntimeEligible: () => win.__shwurxTrack && win.__shwurxThirdParty,
    gtag: (...args: unknown[]) => google.push(args),
  }
  Object.assign(globalThis, { window: win, document: { referrer: "" }, sessionStorage: win.sessionStorage })
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "test", sendBeacon: () => true }, configurable: true })
  bus.cancelPendingConversions("test_reset"); bus.beginPageLoad(); bus.resetPageViewState()
  ready()
})
afterEach(() => { bus.cancelPendingConversions("test_finished"); mock.timers.reset(); mock.restoreAll() })

test("confirmed Meta-only lead targets one configured pixel with opaque ID and no form fields", () => {
  emit("private-crm-record")
  assert.deepEqual(leads(), [["trackSingle", PIXEL, "Lead", {}, { eventID: token }]])
  assert.equal(google.length, 0)
  const payload = JSON.stringify(leads())
  for (const value of ["private-crm-record", "bentley", "mechanical", "enquiry", "phone", "email"]) assert.equal(payload.includes(value), false)
  assert.ok(win.__shwurxDelivery.some((d: any) => d.destination === "meta" && d.state === "dispatched"))
})

test("received response and duplicate retry dispatch one Meta Lead with the same token", async () => {
  let attempt = 0
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    outcome: ++attempt === 1 ? "received" : "duplicate", id: "saved-contact", conversionToken: token,
  }), { status: 200, headers: { "content-type": "application/json" } }))
  for (let i = 0; i < 2; i++) {
    const result = await bus.submitLead({ phone: "+971500000000", name: "Synthetic test" })
    if (result.outcome !== "dry_run") bus.emitConversion(result.id, { form: "contact", token: result.conversionToken })
  }
  assert.equal(leads().length, 1)
  emit("same-token-even-if-caller-id-differs")
  assert.equal(leads().length, 1, "Meta identity is the stable token, not the caller's record id")
})

test("failed, rejected, dry-run and malformed intake responses do not become Meta leads", async () => {
  let response: { status: number; body: unknown }
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(response.body), { status: response.status }))
  for (response of [
    { status: 500, body: { outcome: "error" } },
    { status: 400, body: { outcome: "invalid" } },
    { status: 200, body: { outcome: "received", conversionToken: token } },
    { status: 500, body: { outcome: "received", id: "bad", conversionToken: token } },
  ]) await assert.rejects(bus.submitLead({}))
  response = { status: 200, body: { outcome: "dry_run", id: null } }
  assert.equal((await bus.submitLead({})).outcome, "dry_run")
  assert.equal(leads().length, 0)
})

test("calls, WhatsApp clicks, arbitrary events and appointments are never Meta Lead", () => {
  bus.emitClick("phone_click", "header")
  bus.emitClick("whatsapp_click", "footer")
  bus.track("generate_lead")
  bus.emitConversion("appointment-1", { form: "appointment", outcome: "appointment", token })
  assert.equal(leads().length, 0)
})

test("missing or malformed token and pixel fail closed", () => {
  for (const value of [undefined, null, "", "short", "+971500000000", "a".repeat(33)]) {
    bus.emitConversion("saved", { form: "enquiry", token: value })
  }
  assert.equal(leads().length, 0)
  for (const pixel of [undefined, null, "", "invalid", "12345", "123456;other", "1".repeat(21)]) {
    win.__shwurxTags.metaPixelId = pixel; emit()
  }
  assert.equal(leads().length, 0)
})

test("no consent grant replays a historical skipped lead; explicit later retry can deliver", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  for (const choice of [null, { analytics: false, ads: false }, { analytics: true, ads: false }]) {
    win.__shwurxConsent = choice; emit()
  }
  win.__shwurxConsent = { analytics: false, ads: true }
  mock.timers.tick(12000)
  assert.equal(leads().length, 0)
  emit()
  assert.equal(leads().length, 1)
})

test("master switch, third-party switch and private routes suppress Meta Lead", () => {
  win.__shwurxTrack = false; emit()
  win.__shwurxTrack = true; win.__shwurxThirdParty = false; emit()
  win.__shwurxThirdParty = true
  for (const path of ["/leads", "/auth/login", "/portal", "/track/private-token"]) {
    win.location.pathname = path; emit()
  }
  assert.equal(leads().length, 0)
})

test("delayed bootstrap waits for our pixel initialization then dispatches only once", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  delete win.__shwurxMetaPixelId
  emit(); emit()
  mock.timers.tick(1500)
  assert.equal(leads().length, 0, "another script's fbq alone is not sufficient")
  const runtime = resolveRuntime({ ...SEED_ANALYTICS, enabled: true, owner: "none", metaPixelId: PIXEL }, "www.swurxauto.com", { preview: false, indexable: true })
  runInNewContext(bootstrap(runtime), { window: win, document: {}, localStorage: local, Event, Date, encodeURIComponent })
  assert.equal(win.__shwurxMetaPixelId, PIXEL)
  mock.timers.tick(500)
  emit(); mock.timers.tick(12000)
  assert.equal(leads().length, 1)
  assert.ok(calls.findIndex(c => c[0] === "init") < calls.findIndex(c => c[0] === "trackSingle"))
})

test("queued lead is abandoned after consent withdrawal/regrant, even when Ads is allowed again", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  delete win.fbq; emit()
  win.__shwurxConsent = { analytics: true, ads: false }; win.__shwurxConsentEpoch++
  win.__shwurxConsent = { analytics: true, ads: true }; win.__shwurxConsentEpoch++
  ready(); mock.timers.tick(12000)
  assert.equal(leads().length, 0)
  assert.ok(win.__shwurxDelivery.some((d: any) => d.destination === "meta" && d.reason === "ineligible"))
})

test("queued lead cannot migrate to a different configured pixel", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  delete win.fbq; emit()
  win.__shwurxTags.metaPixelId = "987654321098765"
  win.__shwurxMetaPixelId = "987654321098765"
  win.fbq = (...args: unknown[]) => calls.push(args)
  mock.timers.tick(12000)
  assert.equal(leads().length, 0)
})

test("durable marker from another tab cancels pending Meta delivery", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  delete win.fbq; emit()
  const queued = win.__shwurxDelivery.find((d: any) => d.destination === "meta")
  local.setItem(queued.key, String(Date.now()))
  ready(); mock.timers.tick(12000)
  assert.equal(leads().length, 0)
})

test("memory dedupe protects repeated submissions when browser storage is unavailable", () => {
  win.localStorage = { getItem() { throw new Error("blocked") }, setItem() { throw new Error("blocked") }, removeItem() {} }
  emit(); emit(); emit()
  assert.equal(leads().length, 1)
})

test("tag exceptions are retried without breaking successful lead intake", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  win.fbq = () => { throw new Error("temporarily unavailable") }
  assert.doesNotThrow(() => emit())
  ready(); mock.timers.tick(500)
  assert.equal(leads().length, 1)
})

test("unready pixel retries are bounded; a later tag load does not replay abandoned delivery", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  delete win.fbq; emit()
  // Node's mock clock schedules recursive timers relative to the current tick.
  for (let i = 0; i < 24; i++) mock.timers.tick(500)
  ready(); mock.timers.tick(12000)
  assert.equal(leads().length, 0)
  assert.ok(win.__shwurxDelivery.some((d: any) => d.destination === "meta" && d.reason === "provider_not_ready"))
})

test("Meta dedupe is independent of Google, preserving the existing Google conversion", () => {
  win.__shwurxTagMode = "ga4"
  win.__shwurxConsent = { analytics: true, ads: true }
  emit(); emit()
  assert.equal(leads().length, 1)
  assert.equal(google.filter(c => c[0] === "event" && c[1] === "conversion").length, 1)
  assert.equal(google.filter(c => c[0] === "event" && c[1] === "generate_lead").length, 1)
  assert.equal(calls.some(c => c[0] === "track"), false, "Lead is never broadcast to other initialized pixels")
})
