import { test, beforeEach, mock } from "node:test"
import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import { EVENT_KEYS, safeConversionToken } from "../lib/website/tracking-contract"
import { sanitizeAnalytics, resolveRuntime, SEED_ANALYTICS } from "../lib/website/analytics"
import { planAnalyticsPublish } from "../lib/website/analytics-publish"
import { seedDocument } from "../lib/website/seed"
import { parseTrackBody } from "../lib/website/track-intake"
import { writeConsent, subscribeConsent, readConsent } from "../lib/consent"
import * as bus from "../lib/site-track"
import { bootstrap } from "../components/site-tracking"

class Storage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const cfg = () => ({ ...structuredClone(SEED_ANALYTICS), managed: true, enabled: true })
const token = "ABCDEFGHIJKLMNOPabcdefghijkl1234"
let win: any, local: Storage, doc: any, calls: unknown[][], scripts: string[], trace: string[]
function setConsent(analytics: boolean, ads: boolean) { win.__shwurxConsent = { analytics, ads } }
function nativeListener(choice: { analytics: boolean; ads: boolean }) {
  trace.push(`native:${choice.analytics}/${choice.ads}`)
  return win.__shwurxGtmConsentApplied(choice)
}
function installNative() { assert.equal(win.__shwurxRegisterGtmConsentListener(nativeListener), true) }
function startBootstrap(owner: "gtm" | "gtag" = "gtm") {
  const tags = resolveRuntime({ ...cfg(), owner }, "www.swurxauto.com", { preview: false, indexable: true })
  runInNewContext(bootstrap(tags), { window: win, document: doc, localStorage: local, Event, Date, encodeURIComponent })
}
beforeEach(() => {
  local = new Storage(); calls = []; scripts = []; trace = []
  const mapping = cfg()
  win = {
    location: { pathname: "/brands/porsche", origin: "https://www.swurxauto.com", search: "?email=synthetic@example.test" },
    localStorage: local, sessionStorage: new Storage(), dataLayer: [],
    __shwurxTrack: true, __shwurxThirdParty: true, __shwurxTagMode: "gtm", __shwurxConsentNeeded: true,
    __shwurxTags: { events: mapping.events, ga4Id: mapping.ga4Id, adsId: mapping.adsId, adsLabels: mapping.adsLabels, publicSlugs: { brands: ["porsche"], services: ["painting"] } },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id),
    dispatchEvent: () => true,
    gtag: (...args: unknown[]) => calls.push(args),
    __shwurxPublicRuntimeEligible: () => win.__shwurxTrack && win.__shwurxThirdParty && !win.location.pathname.startsWith("/dashboard"),
    __shwurxSafePageSettings: () => ({ page_location: "https://www.swurxauto.com/brands/porsche", page_referrer: "", page_title: "SHWURX | brand_detail" }),
  }
  doc = { title: "Private synthetic@example.test", referrer: "", createElement: () => ({}), head: { appendChild: (element: { src: string }) => scripts.push(element.src) } }
  Object.assign(globalThis, { window: win, document: doc, sessionStorage: win.sessionStorage })
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "test", sendBeacon: () => true }, configurable: true })
  setConsent(true, true)
  bus.cancelPendingConversions("test_reset")
  bus.resetPageViewState()
  bus.beginPageLoad()
  bus.installGtmConsentBridge()
})

test("all 15 immutable keys produce explicit 26-field schema2 envelopes and enter the GTM bus", () => {
  installNative(); win.dataLayer.length = 0
  for (const key of EVENT_KEYS) {
    const e = bus.envelope(key)
    assert.equal(Object.keys(e).length, 27, "26 fields plus event wrapper")
    assert.equal(e.schema_version, 2); assert.equal(e.event_key, key)
    assert.ok(Object.values(e).every((value) => value !== undefined))
    bus.track(key)
  }
  assert.deepEqual(win.dataLayer.map((e: any) => e.event_key), EVENT_KEYS)
  bus.track("arbitrary_custom_name")
  assert.equal(win.dataLayer.length, 15)
})

test("custom conversion names retain semantic keys and correct published routing, with null resets", () => {
  win.__shwurxTags.events = { lead: "lead_saved", appointment: "visit_requested", phone_click: "call_intent", whatsapp_click: "chat_intent" }
  installNative(); win.dataLayer.length = 0
  bus.emitClick("phone_click", "header")
  bus.emitClick("whatsapp_click", "footer")
  bus.emitConversion("synthetic-record", { form: "enquiry", token })
  bus.emitConversion("synthetic-appointment", { form: "appointment", outcome: "appointment", token })
  const e = win.dataLayer
  assert.deepEqual(e.map((x: any) => x.event_key), ["phone_click", "whatsapp_click", "generate_lead", "appointment_request_received"])
  assert.deepEqual(e.map((x: any) => x.event_name), ["call_intent", "chat_intent", "lead_saved", "visit_requested"])
  assert.deepEqual(e.map((x: any) => x.ads_conversion_label), [cfg().adsLabels.phone_click, cfg().adsLabels.whatsapp_click, cfg().adsLabels.lead, null])
  assert.ok(e.every((x: any) => x.ga4_id === cfg().ga4Id && x.ads_conversion_id === "18492310896"))
  bus.track("navigation_click")
  assert.equal(e[4].ads_conversion_label, null); assert.equal(e[4].conversion_token, null); assert.equal(e[4].form_key, null)
})

test("published routing is distinct from draft values; validated replacement destinations are supported", () => {
  const live = seedDocument(); live.analytics = cfg()
  const draft = structuredClone(live); draft.analytics.ga4Id = "G-DRAFT1234"
  const runtime = resolveRuntime(live.analytics, "www.swurxauto.com", { preview: false, indexable: true })
  assert.equal(runtime.ga4Id, "G-YV9FVWM29N")
  const updated = { ...live.analytics, ga4Id: "G-NEW123456", adsId: "AW-987654321", events: { ...live.analytics.events, lead: "enquiry_saved" } }
  const plan = planAnalyticsPublish({ analytics: updated, expectedDraftVersion: 1, expectedLiveRevisionId: 2 }, { draft, draftVersion: 1, live, liveRevisionId: 2 })
  assert.ok(plan.ok)
  if (!plan.ok) return
  assert.equal(plan.live.analytics.ga4Id, "G-NEW123456")
  assert.equal(plan.live.analytics.events.lead, "enquiry_saved")
  const rt = resolveRuntime(plan.live.analytics, "www.swurxauto.com", { preview: false, indexable: true })
  Object.assign(win.__shwurxTags, rt)
  assert.equal(bus.envelope("generate_lead", { conversion_token: token }).ads_conversion_id, "987654321")
})

test("CMS publish rejects invalid/reserved/contact-shaped/colliding event names instead of silently defaulting", () => {
  for (const name of ["page_view", "google_lead", "ga_lead", "firebase_lead", "lead_0501234567", "phone_click", "bad-name"]) {
    const live = seedDocument(); live.analytics = cfg()
    const input = { ...live.analytics, events: { ...live.analytics.events, lead: name } }
    const drops: string[] = []; sanitizeAnalytics(input, drops)
    assert.ok(drops.length, name)
    const result = planAnalyticsPublish({ analytics: input, expectedDraftVersion: 1, expectedLiveRevisionId: 2 }, { draft: live, draftVersion: 1, live, liveRevisionId: 2 })
    assert.equal(result.ok, false, name)
  }
})

test("path and context telemetry rejects numeric/separated/encoded contact data but preserves year/date/article slugs", () => {
  for (const path of ["/blog/0501234567", "/blog/050-123-4567", "/blog/050_123_4567", "/blog/%30%35%30%31%32%33%34%35%36%37", "/blog/synthetic%40example.test", "/blog/%2530%2535%2530%2531%2532%2533%2534%2535%2536%2537", "/blog/%3Femail%3Dx"])
    assert.equal(bus.pageContext(path).page_path, "/blog/_", path)
  assert.equal(bus.pageContext("/blog/porsche-2016-care-20260510?email=x#phone").page_path, "/blog/porsche-2016-care-20260510")
  assert.equal(bus.pageContext("/ar/brands/porsche").brand_slug, "porsche")
  assert.equal(bus.pageContext("/brands/unknown-brand").page_path, "/brands/_")
  assert.equal(bus.pageContext("/services/painting/0501234567").page_path, "/services/painting/_")
  for (const value of ["0501234567", "050-123-4567", "050_123_4567", "٠٥٠١٢٣٤٥٦٧", "synthetic%40example.test", "tel:0501234567", "https://example.test", "header?phone=0501234567"]) {
    const e = bus.envelope("navigation_click", { placement: value, form_key: value, form_context: value, interaction_id: value, destination: value, platform: value, error_code: value })
    for (const field of ["placement", "form_key", "form_context", "interaction_id", "destination", "platform", "error_code"]) assert.equal(e[field], null, field + value)
  }
  for (const contact of ["٠٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷", "050_123_4567"]) {
    const result = parseTrackBody({ eventType: "page_view", pagePath: "/", campaign: contact }, "test")
    assert.ok(result.ok); if (result.ok) assert.equal(result.record.campaign, null)
  }
  const parsed = parseTrackBody({ eventType: "navigation_click", pagePath: "/", metadata: { placement: "050-123-4567", form_key: "hero", brand_slug: "0501234567" } }, "test")
  assert.ok(parsed.ok); if (parsed.ok) assert.deepEqual(parsed.record.metadata, { form_key: "hero" })
})

test("direct GA4 receives only context params and safe page settings; token, route fields and browser URL/title are absent", () => {
  win.__shwurxTagMode = "ga4"
  bus.emitConversion("private-crm-id", { form: "enquiry", token })
  const ga = calls.find((c) => c[1] === "generate_lead")!
  assert.ok(ga)
  const params = ga[2] as Record<string, unknown>
  assert.equal(Object.keys(params).length, 23, "14 context params, 5 campaign settings, 3 safe page settings and explicit destination")
  assert.equal(params.send_to, "G-YV9FVWM29N", "never broadcast a GA4 event to the shared Ads group")
  for (const key of ["event_key", "conversion_token", "ga4_id", "ads_conversion_id", "ads_conversion_label"]) assert.equal(key in params, false)
  const serialized = JSON.stringify(params)
  for (const value of [token, "private-crm-id", "synthetic@", "?email="]) assert.equal(serialized.includes(value), false)
  assert.equal(params.page_location, "https://www.swurxauto.com/brands/porsche")
  assert.equal(params.page_referrer, "")
})

test("missing/malformed server tokens suppress Ads leads, preserve GA4 and do not turn successful intake into errors", async () => {
  win.__shwurxTagMode = "ga4"
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ outcome: "received", id: "saved-record", conversionToken: null }) }) as Response
    const result = await bus.submitLead({ name: "Synthetic test" })
    assert.equal(result.outcome, "received"); assert.equal(result.conversionToken, null)
    for (const [i, bad] of [null, "short", "x".repeat(33), "a@".repeat(16)].entries()) bus.emitConversion(`saved-${i}`, { form: "enquiry", token: bad })
    assert.equal(calls.filter((c) => c[1] === "generate_lead").length, 4)
    assert.equal(calls.filter((c) => c[1] === "conversion").length, 0)
    win.__shwurxTagMode = "gtm"; installNative(); win.dataLayer.length = 0
    bus.emitConversion("saved-gtm-no-token", { form: "enquiry" })
    assert.equal(win.dataLayer[0].ads_conversion_label, null)
    assert.equal(win.dataLayer[0].event_key, "generate_lead")
    assert.equal(safeConversionToken(token), token)
  } finally { globalThis.fetch = original }
})

test("native consent bridge handles all four choices including revocation, sends only null-reset control events", () => {
  for (const choice of [{ analytics: false, ads: false }, { analytics: true, ads: false }, { analytics: false, ads: true }, { analytics: true, ads: true }]) {
    win.__shwurxConsent = choice
    const before = win.dataLayer.length
    installNative()
    assert.equal(win.dataLayer.length, before + 1)
    const e = win.dataLayer.at(-1)
    assert.equal(e.event, "shwurx_consent_applied"); assert.equal(e.schema_version, 2)
    for (const field of ["event_key", "event_name", "event_id", "conversion_token", "ads_conversion_label", "placement", "form_key", "form_context", "interaction_id", "destination", "platform", "error_code"]) assert.equal(e[field], null)
    assert.equal(e.ga4_id, "G-YV9FVWM29N"); assert.equal(e.ads_conversion_id, "18492310896")
  }
  assert.equal(win.dataLayer.filter((e: any) => e.event === "shwurx_event").length, 0)
  assert.equal(calls.length, 0)
})

test("bridge fails closed and never throws on malformed/stale choices, callback errors or push failures", () => {
  setConsent(false, false)
  assert.equal(win.__shwurxGtmConsentApplied({ analytics: "granted", ads: false }), false)
  assert.equal(win.__shwurxGtmConsentApplied({ analytics: true, ads: false }), false)
  assert.equal(win.__shwurxRegisterGtmConsentListener(() => { throw new Error("synthetic") }), false)
  assert.equal(win.__shwurxRegisterGtmConsentListener(() => true), false, "no acknowledgement is not ready")
  win.dataLayer.push = () => { throw new Error("synthetic push failure") }
  assert.equal(win.__shwurxRegisterGtmConsentListener(nativeListener), false)
  assert.equal(win.__shwurxGtmConsentReady, false)
  win.dataLayer = []; win.location.pathname = "/dashboard"
  assert.equal(win.__shwurxRegisterGtmConsentListener(nativeListener), false)
  assert.equal(win.dataLayer.length, 0)
})

test("bootstrap blocks unknown consent, loads only GTM for Ads-only, and synchronously applies native consent before measurements", () => {
  win.__shwurxConsent = null
  startBootstrap()
  assert.equal(scripts.length, 0)
  assert.equal(readConsent(), null, "unknown consent must keep the consent banner visible")
  assert.equal(calls.length, 0, "GTM mode never queues duplicate gtag consent commands")
  writeConsent({ analytics: false, ads: true })
  assert.equal(scripts.length, 1); assert.match(scripts[0], /gtm\.js\?id=GTM-P6C37X8X$/)
  installNative(); win.dataLayer.length = 0; trace.length = 0
  const stop = subscribeConsent(() => { trace.push("measurement_listener"); bus.notePageView(win.location.pathname) })
  try {
    writeConsent({ analytics: true, ads: true })
    assert.deepEqual(trace, ["native:true/true", "measurement_listener"])
    assert.deepEqual(win.dataLayer.map((e: any) => e.event), ["shwurx_consent_applied", "shwurx_event"])
    assert.equal(win.dataLayer[1].event_key, "page_view")
    writeConsent({ analytics: false, ads: false })
    assert.equal(win.dataLayer.at(-1).event, "shwurx_consent_applied")
    assert.equal(scripts.length, 1, "no second Google owner or re-load")
  } finally { stop() }
})

test("native listener replacement receives a fresh strict copy; only the current callback runs", () => {
  setConsent(true, false)
  let first = 0; let second = 0
  assert.equal(win.__shwurxRegisterGtmConsentListener((c: any) => { first++; return nativeListener(c) }), true)
  assert.equal(win.__shwurxRegisterGtmConsentListener((c: any) => { second++; const result = nativeListener(c); c.ads = true; return result }), true)
  assert.equal(win.__shwurxConsent.ads, false)
  win.__shwurxNotifyGtmConsent()
  assert.equal(first, 1); assert.equal(second, 2)
})

test("queued GTM events never gain a newly granted purpose; revoke/regrant drops pending historic work", () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    setConsent(true, false)
    bus.emitConversion("queued-one", { form: "enquiry", token })
    // No native bridge yet. Granting Ads cannot broaden the queued lead route.
    setConsent(true, true); installNative(); win.dataLayer.length = 0
    mock.timers.tick(500)
    assert.equal(win.dataLayer.length, 1)
    assert.equal(win.dataLayer[0].ads_conversion_id, null)
    assert.equal(win.dataLayer[0].ads_conversion_label, null)
    win.__shwurxGtmConsentReady = false
    bus.track("navigation_click")
    bus.emitConversion("queued-two", { form: "enquiry", token })
    writeConsent({ analytics: false, ads: false }); writeConsent({ analytics: true, ads: true })
    installNative(); win.dataLayer.length = 0
    mock.timers.tick(6000)
    assert.equal(win.dataLayer.length, 0)
  } finally { mock.timers.reset(); bus.cancelPendingConversions("test_end") }
})

test("off, preview, non-indexable and host gates expose no routed destinations; private routes cannot acknowledge or measure", () => {
  for (const [config, host, env] of [
    [{ ...cfg(), enabled: false }, "www.swurxauto.com", { preview: false, indexable: true }],
    [cfg(), "www.swurxauto.com", { preview: true, indexable: true }],
    [cfg(), "www.swurxauto.com", { preview: false, indexable: false }],
    [cfg(), "preview.vercel.app", { preview: false, indexable: true }],
  ] as const) {
    const runtime = resolveRuntime(config, host, env)
    assert.equal(runtime.thirdParty, false); assert.equal(runtime.ga4Id, null); assert.equal(runtime.adsId, null); assert.equal(runtime.gtmId, null)
  }
  for (const path of ["/dashboard", "/login", "/q/private", "/portal", "/api/public/leads"]) {
    win.location.pathname = path
    assert.equal(win.__shwurxRegisterGtmConsentListener(nativeListener), false)
    bus.track("page_view"); bus.emitConversion("private", { form: "enquiry", token })
    assert.equal(win.dataLayer.length, 0)
  }
})

test("direct Ads-only bootstrap never configures GA4; later analytics grant configures it once with safe page defaults", () => {
  win.__shwurxTagMode = "ga4"; setConsent(false, true)
  startBootstrap("gtag")
  assert.equal(scripts.length, 1)
  assert.deepEqual(calls.filter((c) => c[0] === "config").map((c) => c[1]), ["AW-18492310896"])
  writeConsent({ analytics: true, ads: true }); writeConsent({ analytics: true, ads: true })
  assert.deepEqual(calls.filter((c) => c[0] === "config").map((c) => c[1]), ["AW-18492310896", "G-YV9FVWM29N"])
  const params = calls.filter((c) => c[0] === "config").at(-1)![2] as any
  assert.equal(params.send_page_view, false); assert.equal(params.page_referrer, ""); assert.equal(params.page_title, "SHWURX | brand_detail")
})
