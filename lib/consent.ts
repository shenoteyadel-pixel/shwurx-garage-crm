/**
 * Visitor consent for the public website, split into the two decisions Google
 * Consent Mode v2 distinguishes:
 *   analytics → analytics_storage
 *   ads       → ad_storage, ad_user_data, ad_personalization
 *
 * Browser-only, no React. The inline tag bootstrap (components/site-tracking)
 * reads the same storage key and format; keep them in sync.
 */

export const CONSENT_KEY = "shwurx_consent_v2"
export const LEGACY_CONSENT_KEY = "shwurx_consent_v1"

export interface ConsentState {
  analytics: boolean
  ads: boolean
}

interface Stored extends ConsentState {
  v: 2
  at: string
}

declare global {
  interface Window {
    /** true when this page shows the consent banner (tags configured + consent required) */
    __shwurxConsentNeeded?: boolean
    /** in-memory choice; also the fallback when storage is unavailable */
    __shwurxConsent?: ConsentState | null
    /** set by the tag bootstrap; loads/updates tags for the given state */
    __shwurxApplyConsent?: (s: ConsentState | null) => void
    __shwurxRegisterGtmConsentListener?: (callback: (choice: ConsentState) => unknown) => boolean
    __shwurxGtmConsentApplied?: (choice: ConsentState) => boolean
    __shwurxNotifyGtmConsent?: () => boolean
    __shwurxGtmConsentReady?: boolean
    __shwurxConsentEpoch?: number
    __shwurxPublicRuntimeEligible?: () => boolean
    __shwurxSafePageSettings?: () => { page_location: string; page_referrer: string; page_title: string }
  }
}

const listeners = new Set<() => void>()
const DENIED: ConsentState = { analytics: false, ads: false }
let observedStorage: string | undefined
let observedHadV2 = false
let observedWindow: Window | undefined
let applyingChoice = false

function memoryChoice(): ConsentState | null {
  const c = window.__shwurxConsent
  return c == null ? null : { analytics: c.analytics === true, ads: c.ads === true }
}

function storageSnapshot() {
  const raw = window.localStorage.getItem(CONSENT_KEY)
  const old = window.localStorage.getItem(LEGACY_CONSENT_KEY)
  let choice: ConsentState | null = null
  if (raw !== null) {
    try {
      const s = JSON.parse(raw) as Partial<Stored> | null
      choice = s?.v === 2 && typeof s.analytics === "boolean" && typeof s.ads === "boolean"
        ? { analytics: s.analytics, ads: s.ads } : { ...DENIED }
    } catch { choice = { ...DENIED } }
  } else if (old === "granted") choice = { analytics: true, ads: true }
  else if (old !== null) choice = { ...DENIED }
  return { signature: JSON.stringify([raw, old]), hasV2: raw !== null, choice }
}

/** Shared storage changes are applied without writing consent back (no cross-tab echo). */
function applyChoice(next: ConsentState | null) {
  const previous = memoryChoice()
  const changed = (previous === null) !== (next === null)
    || previous?.analytics !== next?.analytics || previous?.ads !== next?.ads
  if (changed) window.__shwurxConsentEpoch = (window.__shwurxConsentEpoch ?? 0) + 1
  window.__shwurxConsent = next ? { ...next } : null
  purgeIdentifiers(next)
  // The native bridge calls effectiveConsent/readConsent itself. It must see the
  // new memory value without entering another storage reconciliation or callback.
  if (applyingChoice) return
  applyingChoice = true
  try {
    try { window.__shwurxApplyConsent?.(next) } catch { /* providers are best-effort */ }
    if (changed) for (const listener of listeners) {
      try { listener() } catch { /* one subscriber must not block withdrawal */ }
    }
  } finally { applyingChoice = false }
}

function observeConsentStorage() {
  if (observedWindow === window) return
  observedWindow = window
  observedStorage = undefined
  observedHadV2 = false
  if (typeof window.addEventListener !== "function") return
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== CONSENT_KEY && event.key !== LEGACY_CONSENT_KEY) return
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return
    } catch { return }
    // Read the current store instead of a potentially superseded queued event.
    reconcileStorage(event.key === null || (event.key === CONSENT_KEY && event.newValue === null))
  })
  window.addEventListener("focus", () => { reconcileStorage() })
}

function reconcileStorage(removed = false): ConsentState | null {
  if (applyingChoice) return memoryChoice()
  try {
    const snapshot = storageSnapshot()
    const first = observedStorage === undefined
    const changed = !first && snapshot.signature !== observedStorage
    const v2Removed = !snapshot.hasV2 && (removed || observedHadV2)
    observedStorage = snapshot.signature
    observedHadV2 = snapshot.hasV2
    if (changed || removed || (first && snapshot.choice !== null)) {
      // Removal and unsupported versions revoke an existing choice rather than
      // falling back to a stale legacy grant or silently keeping memory granted.
      applyChoice(v2Removed || snapshot.choice === null ? { ...DENIED } : snapshot.choice)
    }
    // An unchanged persisted value must not undo a same-tab choice whose write
    // failed (quota/private mode); a genuinely changed store takes precedence.
    return memoryChoice() ?? snapshot.choice
  } catch {
    return memoryChoice()
  }
}

/** null = the visitor has not chosen yet. */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null
  observeConsentStorage()
  return reconcileStorage()
}

/** What may run right now. Without a consent requirement on this page, both are allowed. */
export function effectiveConsent(): ConsentState {
  if (typeof window === "undefined") return { analytics: false, ads: false }
  if (window.__shwurxConsentNeeded !== true) return { analytics: true, ads: true }
  const c = readConsent()
  return { analytics: !!c?.analytics, ads: !!c?.ads }
}

/** Keys that hold identifiers; removed when the matching consent is withdrawn. */
const ADS_KEYS = ["shwurx_touch_v4", "shwurx_touch_first_v3", "shwurx_touch_latest_v3"]
const ANALYTICS_KEYS = ["shwurx_sid"]

function purgeIdentifiers(next: ConsentState | null) {
  if (!next?.ads) {
    for (const k of ADS_KEYS) {
      try {
        window.localStorage.removeItem(k)
        window.sessionStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
  if (!next?.analytics) {
    for (const k of ANALYTICS_KEYS) {
      try {
        window.sessionStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
}

export function writeConsent(next: ConsentState) {
  readConsent() // Establish the persisted baseline before a possibly failing write.
  next = { analytics: next.analytics === true, ads: next.ads === true }
  try {
    const stored: Stored = { v: 2, analytics: next.analytics, ads: next.ads, at: new Date().toISOString() }
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(stored))
    window.localStorage.removeItem(LEGACY_CONSENT_KEY)
    const snapshot = storageSnapshot()
    observedStorage = snapshot.signature
    observedHadV2 = snapshot.hasV2
  } catch {
    /* The unchanged stored baseline cannot overwrite this page's latest choice. */
  }
  applyChoice(next)
}

export function subscribeConsent(cb: () => void) {
  if (typeof window !== "undefined") {
    observeConsentStorage()
    reconcileStorage()
  }
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

const reopenListeners = new Set<() => void>()
/** "Privacy choices" link: reopens the banner so a visitor can change or withdraw consent. */
export function reopenConsent() {
  reopenListeners.forEach((l) => l())
}
export function subscribeReopen(cb: () => void) {
  reopenListeners.add(cb)
  return () => {
    reopenListeners.delete(cb)
  }
}
