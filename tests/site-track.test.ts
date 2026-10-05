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
  clearTimeout: (id: number) => clearTimeout(id),
  __shwurxTags: { ga4Id: "G-TEST1234", events: {}, adsLabels: {} },
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
  track.beginPageLoad()
  visit("/brands/porsche", "?utm_source=google&utm_campaign=spring")
  const v1 = track.captureAttribution()
  assert.equal(v1.first.utm_campaign, "spring")
  assert.equal(v1.latest.utm_campaign, "spring")

  track.beginPageLoad()
  visit("/services", "")
  const organic = track.captureAttribution()
  assert.equal(organic.latest.utm_campaign, "spring", "a non-campaign visit keeps the latest campaign")

  // Same document: a client-side navigation never re-evaluates the entry.
  visit("/contact", "?utm_source=meta&utm_campaign=summer&gclid=Cj0KCQjwabc123_XYZ")
  assert.equal(track.captureAttribution().latest.utm_campaign, "spring")

  track.beginPageLoad()
  const v2 = track.captureAttribution()
  assert.equal(v2.first.utm_campaign, "spring")
  assert.equal(v2.first.landingPath, "/brands/porsche")
  assert.equal(v2.latest.utm_campaign, "summer")
  assert.equal(v2.latest.gclid, "Cj0KCQjwabc123_XYZ")

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
    win.__shwurxTrack = true
    win.__shwurxThirdParty = true
    win.__shwurxTagMode = "ga4"
    visit("/contact")
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
    win.__shwurxTrack = true
    visit("/contact")
    delete win.dataLayer
    track.emitConversion("lead-3", { form: "enquiry" })
    local.setItem("shwurx_conv4_lead_lead-3", String(Date.now()))
    win.dataLayer = []
    mock.timers.tick(5000)
    assert.equal((win.dataLayer as unknown[]).length, 0)
  } finally {
    mock.timers.reset()
  }
})

const beacons: string[] = []
async function captureBeacons() {
  beacons.length = 0
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: "test",
      sendBeacon: (_u: string, b: Blob) => {
        void b.text().then((t) => beacons.push(JSON.parse(t).eventType))
        return true
      },
    },
    configurable: true,
  })
}
const flushMicro = () => new Promise((r) => setTimeout(r, 5))

function requireConsent(state: { analytics: boolean; ads: boolean } | null) {
  win.__shwurxConsentNeeded = true
  win.__shwurxConsent = state
  local.removeItem("shwurx_consent_v2")
  local.removeItem("shwurx_consent_v1")
}

test("delayed analytics grant sends the CURRENT page view once, never earlier pages", async () => {
  const track = await load()
  local.clear()
  track.resetPageViewState()
  await captureBeacons()
  win.__shwurxTrack = true
  win.__shwurxThirdParty = false
  requireConsent(null)

  visit("/services")
  track.notePageView("/services")
  track.notePageView("/services") // StrictMode double effect
  visit("/contact")
  track.notePageView("/contact") // SPA navigation before consent
  await flushMicro()
  assert.equal(beacons.length, 0, "nothing sent before consent")

  // Grant well after any 5s retry window would have expired.
  win.__shwurxConsent = { analytics: true, ads: false }
  assert.equal(track.flushPageView(), true)
  assert.equal(track.flushPageView(), false, "second grant notification is a no-op")
  track.notePageView("/contact") // re-render of the same instance
  await flushMicro()
  assert.deepEqual(beacons, ["page_view"], "only /contact, once")

  visit("/about")
  track.notePageView("/about")
  visit("/contact")
  track.notePageView("/contact") // back navigation = new instance
  await flushMicro()
  assert.equal(beacons.filter((b) => b === "page_view").length, 3)
  delete win.__shwurxConsentNeeded
  delete win.__shwurxConsent
})

test("denied analytics stores no first-party conversion marker; a later eligible retry sends", async () => {
  const track = await load()
  local.clear()
  session.clear()
  await captureBeacons()
  win.__shwurxTrack = true
  win.__shwurxThirdParty = false
  visit("/contact")
  requireConsent({ analytics: false, ads: false })

  track.emitConversion("lead-denied", { form: "enquiry" })
  await flushMicro()
  assert.equal(beacons.length, 0)
  assert.equal(local.getItem("shwurx_conv1_lead_lead-denied"), null, "no marker on denied consent")
  assert.equal(session.getItem("shwurx_sid"), null, "no analytics session identifier")

  win.__shwurxConsent = { analytics: true, ads: false }
  track.emitConversion("lead-denied", { form: "enquiry" })
  track.emitConversion("lead-denied", { form: "enquiry" })
  await flushMicro()
  assert.deepEqual(beacons, ["enquiry_persisted"], "sent once after grant")
  assert.ok(local.getItem("shwurx_conv1_lead_lead-denied"))
  assert.equal(local.getItem("shwurx_conv4_lead_lead-denied"), null, "provider dedupe is separate and untouched")
  delete win.__shwurxConsentNeeded
  delete win.__shwurxConsent
})

function directOwner(consent: { analytics: boolean; ads: boolean }) {
  win.__shwurxTrack = true
  win.__shwurxThirdParty = true
  win.__shwurxTagMode = "ga4"
  win.__shwurxTags = {
    events: { lead: "generate_lead", appointment: "appointment_request_received", phone_click: "phone_click", whatsapp_click: "whatsapp_click" },
    ga4Id: "G-TEST1234",
    adsId: "AW-123456789",
    adsLabels: { lead: "LEADLBL", appointment: "APPTLBL", phone_click: "PHONELBL", whatsapp_click: "WALBL" },
  }
  requireConsent(consent)
  const calls: unknown[][] = []
  win.gtag = (...args: unknown[]) => calls.push(args)
  visit("/contact")
  return calls
}
function endDirect() {
  delete win.__shwurxTags
  delete win.__shwurxConsentNeeded
  delete win.__shwurxConsent
}

test("direct owner: GA4-only lead, then an explicit same-record retry after Ads grant sends only the Ads conversion", async () => {
  const track = await load()
  local.clear()
  try {
    const calls = directOwner({ analytics: true, ads: false })
    track.emitConversion("lead-split", { form: "enquiry", token: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })
    assert.deepEqual(calls.map((c) => c[1]), ["generate_lead"], "no Ads conversion without ads consent")
    assert.ok(local.getItem("shwurx_conv4_ga4_lead_lead-split"))
    assert.equal(local.getItem("shwurx_conv4_ads_lead_lead-split"), null)

    win.__shwurxConsent = { analytics: true, ads: true }
    assert.equal(calls.length, 1, "granting Ads never replays the historical conversion")

    track.emitConversion("lead-split", { form: "enquiry", token: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })
    assert.equal(calls.length, 2)
    assert.equal(calls[1][1], "conversion")
    assert.deepEqual(calls[1][2], { send_to: "AW-123456789/LEADLBL", transaction_id: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })

    track.emitConversion("lead-split", { form: "enquiry", token: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })
    assert.equal(calls.length, 2, "both destinations now deduped")
  } finally {
    endDirect()
  }
})

test("direct owner: Ads-only consent sends the Ads conversion without any GA4 event", async () => {
  const track = await load()
  local.clear()
  try {
    const calls = directOwner({ analytics: false, ads: true })
    track.emitConversion("lead-ads", { form: "enquiry", token: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })
    track.emitClick("phone_click", "header")
    track.track("cta_click", { placement: "hero" })
    track.track("navigation_click", { placement: "header" })
    assert.deepEqual(calls.map((c) => c[1]), ["conversion", "conversion"])
    assert.equal((calls[1][2] as { send_to: string }).send_to, "AW-123456789/PHONELBL")
    assert.equal(local.getItem("shwurx_conv4_ga4_lead_lead-ads"), null)
  } finally {
    endDirect()
  }
})

test("direct owner: a queued event is not replayed to a destination granted later", async () => {
  const track = await load()
  local.clear()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const calls = directOwner({ analytics: false, ads: true })
    delete win.gtag
    track.track("navigation_click", { placement: "header" })
    win.__shwurxConsent = { analytics: true, ads: true }
    win.gtag = (...args: unknown[]) => calls.push(args)
    mock.timers.tick(6000)
    assert.equal(calls.length, 0)
  } finally {
    mock.timers.reset()
    endDirect()
  }
})
