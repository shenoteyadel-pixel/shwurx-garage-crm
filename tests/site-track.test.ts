import { test, mock } from "node:test"
import assert from "node:assert/strict"

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}

const local = new MemoryStorage()
const session = new MemoryStorage()
const loc = { pathname: "/", search: "", origin: "https://www.swurxauto.com" }
const win: Record<string, unknown> = {
  localStorage: local,
  sessionStorage: session,
  location: loc,
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
}
Object.assign(globalThis, {
  window: win,
  sessionStorage: session,
  document: { referrer: "" },
})
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "test", sendBeacon: () => true }, configurable: true })

const load = () => import("../lib/site-track")

function visit(path: string, search = "") {
  loc.pathname = path
  loc.search = search
}

test("first touch is immutable; latest moves on a later campaign; both reach the API separately", async () => {
  const track = await load()
  local.clear()
  visit("/brands/porsche", "?utm_source=google&utm_campaign=spring")
  const v1 = track.captureAttribution()
  assert.equal(v1.first.utm_campaign, "spring")
  assert.equal(v1.latest.utm_campaign, "spring")

  visit("/services", "")
  const organic = track.captureAttribution()
  assert.equal(organic.latest.utm_campaign, "spring", "a non-campaign visit keeps the latest campaign")

  visit("/contact", "?utm_source=meta&utm_campaign=summer&gclid=abc")
  const v2 = track.captureAttribution()
  assert.equal(v2.first.utm_campaign, "spring")
  assert.equal(v2.first.landingPath, "/brands/porsche")
  assert.equal(v2.latest.utm_campaign, "summer")
  assert.equal(v2.latest.gclid, "abc")

  const read = track.getAttribution()
  assert.notDeepEqual(read.first, read.latest)
  assert.equal(read.first.utm_source, "google")
  assert.equal(read.latest.utm_source, "meta")
})

test("same lead id emitted twice before the provider is ready dispatches generate_lead once", async () => {
  const track = await load()
  local.clear()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    win.__shwurxTrack = false
    win.__shwurxThirdParty = true
    win.__shwurxTagMode = "ga4"
    delete win.gtag
    const calls: unknown[][] = []

    track.emitConversion("lead-1", { form: "enquiry" })
    track.emitConversion("lead-1", { form: "enquiry" })
    mock.timers.tick(1500)
    assert.equal(calls.length, 0)

    win.gtag = (...args: unknown[]) => calls.push(args)
    track.emitConversion("lead-1", { form: "enquiry" })
    mock.timers.tick(5000)
    assert.equal(calls.filter((c) => c[1] === "generate_lead").length, 1)

    track.emitConversion("lead-1", { form: "enquiry" })
    mock.timers.tick(5000)
    assert.equal(calls.length, 1, "durable marker blocks a later re-emit")

    track.emitConversion("lead-2", { form: "enquiry" })
    assert.equal(calls.length, 2, "a different lead converts independently")
  } finally {
    mock.timers.reset()
  }
})

test("a marker written elsewhere while a retry is queued cancels the queued dispatch", async () => {
  const track = await load()
  local.clear()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    win.__shwurxThirdParty = true
    win.__shwurxTagMode = "gtm"
    delete win.dataLayer
    track.emitConversion("lead-3", { form: "enquiry" })
    local.setItem("shwurx_conv3_lead-3", "1")
    win.dataLayer = []
    mock.timers.tick(5000)
    assert.equal((win.dataLayer as unknown[]).length, 0)
  } finally {
    mock.timers.reset()
  }
})
