// Real consent + event-bus modules in separate window contexts, with shared
// synthetic storage and provider sinks. No browser, network or database calls.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto")
const ts = require("typescript")
const root = path.resolve(__dirname, "..")
const KEY = "shwurx_consent_v2"
const clone = (value) => JSON.parse(JSON.stringify(value))

function windows(mode = "gtm") {
  const values = new Map(), tabs = [], queued = []
  function make() {
    const handlers = new Map(), timerTasks = new Map(), events = [], native = [], subscriber = [], trace = [], cache = new Map()
    let failWrites = false, timer = 0, applying = 0
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (failWrites) throw Error("Synthetic quota exceeded")
        const oldValue = values.get(key) ?? null; values.set(key, String(value))
        if (oldValue !== String(value)) queued.push({ source: storage, key, oldValue, newValue: String(value) })
      },
      removeItem(key) {
        if (failWrites) throw Error("Synthetic storage unavailable")
        const oldValue = values.get(key) ?? null; values.delete(key)
        if (oldValue !== null) queued.push({ source: storage, key, oldValue, newValue: null })
      },
    }
    const session = new Map(), layer = []
    layer.push = (value) => { events.push({ sink: "gtm", value: clone(value) }); return Array.prototype.push.call(layer, value) }
    const win = {
      location: { pathname: "/brands/porsche", origin: "https://www.swurxauto.com", search: "" },
      localStorage: storage, sessionStorage: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
      __shwurxTrack: true, __shwurxThirdParty: true, __shwurxTagMode: mode, __shwurxConsentNeeded: true,
      __shwurxTags: { events: { lead: "generate_lead", appointment: "appointment_request_received", phone_click: "phone_click", whatsapp_click: "whatsapp_click" }, ga4Id: "G-SYNTHETIC1", adsId: "AW-123456789", adsLabels: { lead: "SyntheticLabel" }, publicSlugs: { brands: ["porsche"], services: [] } },
      dataLayer: layer, gtag: (...args) => events.push({ sink: "gtag", value: clone(args) }),
      addEventListener(name, fn) { const set = handlers.get(name) ?? new Set(); set.add(fn); handlers.set(name, set) },
      setTimeout(fn) { timerTasks.set(++timer, fn); return timer }, clearTimeout(id) { timerTasks.delete(id) },
    }
    const ctx = vm.createContext({ window: win, document: { referrer: "", title: "Synthetic" }, navigator: { userAgent: "synthetic", sendBeacon() { events.push({ sink: "first-party" }); return true } }, crypto: crypto.webcrypto, URL, URLSearchParams, Blob, Date, structuredClone, console, fetch() { throw Error("No network in test") } })
    function load(file) {
      if (cache.has(file)) return cache.get(file).exports
      const module = { exports: {} }; cache.set(file, module)
      const js = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
      vm.runInContext("(function(require,module,exports){" + js + "\n})", ctx)((name) => {
        if (name.startsWith("@/")) return load(name.slice(2) + ".ts")
        if (name.startsWith(".")) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + ".ts")
        throw Error("Unexpected dependency " + name)
      }, module, module.exports)
      return module.exports
    }
    const consent = load("lib/consent.ts"), bus = load("lib/site-track.ts")
    win.__shwurxApplyConsent = (choice) => {
      assert(++applying < 4, "Provider/readConsent must not recurse")
      try {
        native.push(clone(choice)); trace.push("native")
        assert.deepEqual(clone(consent.effectiveConsent()), choice ?? { analytics: false, ads: false })
        if (mode === "gtm") win.__shwurxNotifyGtmConsent()
      } finally { applying-- }
    }
    bus.installGtmConsentBridge()
    if (mode === "gtm") win.__shwurxRegisterGtmConsentListener((choice) => win.__shwurxGtmConsentApplied(choice))
    consent.subscribeConsent(() => {
      trace.push("subscriber"); const c = consent.effectiveConsent(); subscriber.push(clone(c))
      if (c.ads) bus.persistAttributionAfterConsent()
      if (c.analytics) bus.flushPageView()
      if (!c.analytics && !c.ads) bus.cancelPendingConversions("consent_withdrawn")
    })
    const tab = { win, consent, bus, events, native, subscriber, trace, storage, session,
      set failWrites(value) { failWrites = value },
      dispatch(name, event = {}) { for (const fn of handlers.get(name) ?? []) fn(event) },
      timers() { const tasks = [...timerTasks.values()]; timerTasks.clear(); tasks.forEach((fn) => fn()) },
    }
    tabs.push(tab); return tab
  }
  return { make, values,
    flush() { const events = queued.splice(0); for (const event of events) for (const tab of tabs) if (event.source !== tab.storage) tab.dispatch("storage", { ...event, storageArea: tab.storage }) },
  }
}
const granted = { analytics: true, ads: true }, denied = { analytics: false, ads: false }
const measurements = (events) => events.filter((e) => e.sink !== "gtm" || e.value.event === "shwurx_event")

for (const mode of ["gtm", "ga4"]) {
  test(`${mode}: another tab's withdrawal blocks real event sinks even before its storage event arrives`, () => {
    const hub = windows(mode), a = hub.make(), b = hub.make()
    a.consent.writeConsent(granted); hub.flush()
    b.consent.writeConsent(denied)
    const before = a.events.length, epoch = a.win.__shwurxConsentEpoch
    a.bus.track("navigation_click", { placement: "header" })
    assert.deepEqual(clone(a.consent.effectiveConsent()), denied)
    assert.equal(measurements(a.events.slice(before)).length, 0)
    assert(a.win.__shwurxConsentEpoch > epoch)
    assert.deepEqual(a.native.at(-1), denied)
    assert.equal(a.trace.at(-2), "native"); assert.equal(a.trace.at(-1), "subscriber")
  })
}

test("storage event immediately narrows native consent, purges identifiers and does not echo a consent write", () => {
  const hub = windows(), a = hub.make(), b = hub.make()
  a.consent.writeConsent(granted); hub.flush()
  a.storage.setItem("shwurx_touch_v4", "SYNTHETIC"); a.session.set("shwurx_sid", "SYNTHETIC")
  b.consent.writeConsent(denied)
  const raw = hub.values.get(KEY); hub.flush()
  assert.equal(hub.values.get(KEY), raw)
  assert.equal(hub.values.has("shwurx_touch_v4"), false); assert.equal(a.session.has("shwurx_sid"), false)
  assert.deepEqual(a.native.at(-1), denied); assert.deepEqual(a.subscriber.at(-1), denied)
  const count = a.subscriber.length; hub.flush(); assert.equal(a.subscriber.length, count)
})

test("focus reconciles a suspended tab without waiting for a measurement or replaying old events", () => {
  const hub = windows(), a = hub.make(), b = hub.make()
  a.consent.writeConsent(granted); hub.flush(); b.consent.writeConsent(denied)
  a.dispatch("focus")
  assert.deepEqual(a.native.at(-1), denied); assert.deepEqual(clone(a.consent.readConsent()), denied)
})

test("removed, unsupported and malformed consent fail closed even with a stale legacy grant", () => {
  for (const invalid of [null, JSON.stringify({ v: 3, analytics: true, ads: true }), "{broken-json"]) {
    const hub = windows(), a = hub.make(), b = hub.make()
    a.consent.writeConsent(granted); hub.flush()
    b.storage.setItem("shwurx_consent_v1", "granted")
    if (invalid === null) b.storage.removeItem(KEY); else b.storage.setItem(KEY, invalid)
    hub.flush()
    assert.deepEqual(clone(a.consent.effectiveConsent()), denied)
    const before = a.events.length; a.bus.track("phone_click")
    assert.equal(measurements(a.events.slice(before)).length, 0)
  }
})

test("failed same-tab storage writes keep the latest local denial; genuinely changed shared storage is still reconciled", () => {
  const hub = windows(), a = hub.make(), b = hub.make()
  a.consent.writeConsent(granted); hub.flush(); a.failWrites = true
  a.consent.writeConsent(denied)
  assert.equal(JSON.parse(hub.values.get(KEY)).analytics, true)
  assert.deepEqual(clone(a.consent.readConsent()), denied)
  a.dispatch("focus"); assert.deepEqual(clone(a.consent.readConsent()), denied)
  b.consent.writeConsent({ analytics: false, ads: true }); hub.flush()
  assert.deepEqual(clone(a.consent.readConsent()), { analytics: false, ads: true })
})

test("cross-tab revoke then grant invalidates queued historical conversion and click retries", () => {
  const hub = windows(), a = hub.make(), b = hub.make()
  a.consent.writeConsent(granted); hub.flush()
  a.win.__shwurxGtmConsentReady = false
  a.bus.emitConversion("synthetic-retry", { form: "enquiry", token: "ABCDEFGHIJKLMNOPabcdefghijkl1234" })
  a.bus.emitClick("phone_click", "header")
  const before = a.events.length
  b.consent.writeConsent(denied); hub.flush()
  b.consent.writeConsent(granted); hub.flush()
  a.timers()
  assert.equal(measurements(a.events.slice(before)).length, 0)
  assert(a.win.__shwurxDelivery.some((e) => e.state === "abandoned"))
})

test("stale storage events read the latest store; unrelated storage and session events do not alter consent", () => {
  const hub = windows(), a = hub.make(), b = hub.make()
  a.consent.writeConsent(granted); hub.flush()
  a.dispatch("storage", { key: KEY, newValue: null, storageArea: a.storage })
  assert.deepEqual(clone(a.consent.readConsent()), granted)
  const epoch = a.win.__shwurxConsentEpoch
  a.dispatch("storage", { key: "unrelated", newValue: "value", storageArea: a.storage })
  a.dispatch("storage", { key: KEY, newValue: null, storageArea: {} })
  assert.equal(a.win.__shwurxConsentEpoch, epoch)
})
