import { beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import * as bus from "../lib/site-track"
import { bootstrap } from "../components/site-tracking"
import { resolveRuntime, SEED_ANALYTICS } from "../lib/website/analytics"

const campaignKeys = ["campaign_source", "campaign_medium", "campaign_name", "campaign_content", "campaign_term"] as const
class Storage {
  values = new Map<string, string>()
  getItem(k: string) { return this.values.get(k) ?? null }
  setItem(k: string, v: string) { this.values.set(k, v) }
  removeItem(k: string) { this.values.delete(k) }
}
let win: any, doc: any, calls: any[][], local: Storage
const query = "?utm_source=google&utm_medium=cpc&utm_campaign=shwurx_porsche_search&utm_content=hero&utm_term=porsche%20repair&gclid=Cj0KCQjw_SYNTHETIC123&email=synthetic%40example.test"
function init(search = query, referrer = "https://www.referral.test/private?email=synthetic@example.test#phone") {
  const config = { ...structuredClone(SEED_ANALYTICS), managed: true, enabled: true }
  calls = []; local = new Storage()
  win = {
    location: { pathname: "/brands/porsche", search, origin: "https://www.swurxauto.com" },
    localStorage: local, sessionStorage: new Storage(), dataLayer: [],
    __shwurxTrack: true, __shwurxThirdParty: true, __shwurxTagMode: "gtm", __shwurxConsentNeeded: true,
    __shwurxConsent: { analytics: true, ads: false },
    __shwurxTags: { ...config, publicSlugs: { brands: ["porsche"], services: ["painting"] } },
    gtag: (...args: any[]) => calls.push(args),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id),
    dispatchEvent: () => true,
    __shwurxPublicRuntimeEligible: () => win.__shwurxTrack && win.__shwurxThirdParty,
  }
  doc = { referrer, head: { appendChild: () => {} }, createElement: () => ({}) }
  Object.assign(globalThis, { window: win, document: doc, sessionStorage: win.sessionStorage })
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "test", sendBeacon: () => true }, configurable: true })
  bus.cancelPendingConversions("test_reset"); bus.beginPageLoad(); bus.resetPageViewState()
  return config
}
function bridge() {
  bus.installGtmConsentBridge()
  assert.equal(win.__shwurxRegisterGtmConsentListener((choice: any) => win.__shwurxGtmConsentApplied(choice)), true)
}
beforeEach(() => { init() })

test("native consent control carries safe current-entry campaign before the first manual view", () => {
  bridge(); bus.notePageView(win.location.pathname)
  const [control, view] = win.dataLayer
  assert.equal(control.event, "shwurx_consent_applied"); assert.equal(control.event_key, null)
  assert.equal(view.event_key, "page_view")
  for (const event of [control, view]) {
    assert.equal(event.campaign_source, "google"); assert.equal(event.campaign_medium, "cpc")
    assert.equal(event.campaign_name, "shwurx_porsche_search"); assert.equal(event.campaign_content, "hero")
    assert.equal(event.campaign_term, "porsche repair")
    assert.equal(event.external_referrer_origin, "https://www.referral.test")
    assert.equal(event.page_path, "/brands/porsche")
    for (const forbidden of ["gclid", "gbraid", "wbraid", "utm_source", "email"]) assert.equal(forbidden in event, false)
  }
  const serialized = JSON.stringify(win.dataLayer)
  for (const privateValue of ["synthetic@", "?email=", "Cj0KCQjw", "/private", "#phone"]) assert.equal(serialized.includes(privateValue), false)
})

test("direct base config and GA4 event receive documented campaign fields and safe referrer", () => {
  const config = init(); win.__shwurxTagMode = "ga4"; bus.installGtmConsentBridge()
  const runtime = resolveRuntime({ ...config, owner: "gtag" }, "www.swurxauto.com", { preview: false, indexable: true })
  runInNewContext(bootstrap(runtime), { window: win, document: doc, localStorage: local, Event, Date, encodeURIComponent })
  bus.notePageView(win.location.pathname)
  const baseIndex = calls.findIndex((c) => c[0] === "config" && c[1] === runtime.ga4Id)
  const viewIndex = calls.findIndex((c) => c[0] === "event" && c[1] === "page_view")
  assert.ok(baseIndex >= 0 && viewIndex > baseIndex)
  for (const value of [calls[baseIndex][2], calls[viewIndex][2]]) {
    assert.equal(value.campaign_name, "shwurx_porsche_search")
    assert.equal(value.page_referrer, "https://www.referral.test")
    assert.equal(value.page_location, "https://www.swurxauto.com/brands/porsche")
    assert.equal(value.page_location.includes("?"), false)
    assert.equal("external_referrer_origin" in value, false)
    assert.equal("conversion_token" in value, false)
  }
  assert.equal(calls[baseIndex][2].send_page_view, false)
})

test("retained or poisoned CRM touch cannot populate a new direct visit's Google campaign", () => {
  init("", "")
  const old = { at: new Date().toISOString(), utm_source: "meta", utm_campaign: "old_campaign", utm_term: "synthetic@example.test", referrer: "https://private.test/path?phone=0501234567", gclid: "0501234567" }
  local.setItem(bus.TOUCH_KEY, JSON.stringify({ version: 4, first: old, latest: old }))
  bus.installGtmConsentBridge()
  const event = bus.envelope("page_view")
  for (const k of campaignKeys) assert.equal(event[k], null)
  assert.equal(event.external_referrer_origin, "")
  assert.equal(win.__shwurxSafePageSettings().page_referrer, "")
  assert.equal(JSON.stringify(event).includes("old_campaign"), false)
})

test("SPA and language changes preserve document entry; a fresh document clears it", () => {
  bridge()
  win.location.pathname = "/ar/services/painting"; win.location.search = "?utm_source=meta&utm_campaign=other"
  const sameDocument = bus.envelope("page_view")
  assert.equal(sameDocument.campaign_name, "shwurx_porsche_search")
  assert.equal(sameDocument.page_path, "/ar/services/painting")
  win.location.search = ""; doc.referrer = ""; bus.beginPageLoad(); bus.installGtmConsentBridge()
  const fresh = bus.envelope("page_view")
  for (const k of campaignKeys) assert.equal(fresh[k], null)
  assert.equal(fresh.external_referrer_origin, "")
})

test("contact-shaped campaign inputs and unsafe referrers are rejected without raw query fallback", () => {
  for (const unsafe of ["synthetic@example.test", "synthetic%40example.test", "0501234567", "050-123-4567", "٠٥٠١٢٣٤٥٦٧", "tel:0501234567", "https://private.test/path", "www.private.test"]) {
    init("?" + ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => `${k}=${encodeURIComponent(unsafe)}`).join("&"), "")
    bus.installGtmConsentBridge(); const event = bus.envelope("page_view")
    for (const k of campaignKeys) assert.equal(event[k], null, k + unsafe)
  }
  for (const referrer of ["https://synthetic@example.test/private", "https://0501234567.example.test/path", "javascript:alert(1)", "https://www.swurxauto.com/contact?email=x", "bad-url"]) {
    init("", referrer); bus.installGtmConsentBridge()
    assert.equal(bus.envelope("page_view").external_referrer_origin, "", referrer)
  }
})

test("analytics purpose controls campaign projection even when Ads is allowed", () => {
  win.__shwurxConsent = { analytics: false, ads: true }; bridge()
  const event = bus.envelope("phone_click")
  for (const k of [...campaignKeys, "external_referrer_origin"]) assert.equal(event[k], null, k)
  const settings = win.__shwurxSafePageSettings()
  for (const k of campaignKeys) assert.equal(settings[k], null)
  assert.equal(settings.page_referrer, ""); assert.equal(event.ga4_id, null)
  win.__shwurxConsent = { analytics: true, ads: true }; assert.equal(win.__shwurxNotifyGtmConsent(), true)
  const control = win.dataLayer.at(-1)
  assert.equal(control.event, "shwurx_consent_applied"); assert.equal(control.campaign_name, "shwurx_porsche_search")
  for (const k of campaignKeys) assert.equal(event[k], null, "the old envelope is never widened")
})

test("a queued Ads-only envelope never acquires campaigns on a later analytics grant", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    win.__shwurxConsent = { analytics: false, ads: true }; bus.installGtmConsentBridge()
    bus.track("navigation_click")
    win.__shwurxConsent = { analytics: true, ads: true }; win.__shwurxGtmConsentReady = true
    mock.timers.tick(500)
    const event = win.dataLayer.find((e: any) => e.event_key === "navigation_click")
    assert.ok(event); assert.equal(event.ga4_id, null)
    for (const k of [...campaignKeys, "external_referrer_origin"]) assert.equal(event[k], null, k)
  } finally { mock.timers.reset() }
})

test("withdrawal narrows queued campaign values and safe callback; master off is also inert", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    bus.installGtmConsentBridge(); bus.track("navigation_click")
    win.__shwurxConsent = { analytics: false, ads: true }; win.__shwurxGtmConsentReady = true
    mock.timers.tick(500)
    const event = win.dataLayer.find((e: any) => e.event_key === "navigation_click")
    assert.ok(event); assert.equal(event.ga4_id, null)
    for (const k of [...campaignKeys, "external_referrer_origin"]) assert.equal(event[k], null, k)
    win.__shwurxConsent = { analytics: true, ads: true }; win.__shwurxThirdParty = false
    for (const k of campaignKeys) assert.equal(win.__shwurxSafePageSettings()[k], null)
    assert.equal(win.__shwurxSafePageSettings().page_referrer, "")
  } finally { mock.timers.reset() }
})
