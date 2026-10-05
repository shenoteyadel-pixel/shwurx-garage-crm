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
  }
}

const listeners = new Set<() => void>()

/** null = the visitor has not chosen yet. */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>
      if (s && s.v === 2) return { analytics: s.analytics === true, ads: s.ads === true }
    }
    // One-time migration from the single accept/decline choice.
    const old = window.localStorage.getItem(LEGACY_CONSENT_KEY)
    if (old === "granted") return { analytics: true, ads: true }
    if (old === "denied") return { analytics: false, ads: false }
  } catch {
    /* storage blocked: fall through to the in-memory choice */
  }
  return window.__shwurxConsent ?? null
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

export function writeConsent(next: ConsentState) {
  const prev = readConsent()
  window.__shwurxConsent = next
  try {
    const stored: Stored = { v: 2, analytics: next.analytics, ads: next.ads, at: new Date().toISOString() }
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(stored))
    window.localStorage.removeItem(LEGACY_CONSENT_KEY)
  } catch {
    /* private mode: the choice applies to this page only */
  }
  if (!next.ads) {
    for (const k of ADS_KEYS) {
      try {
        window.localStorage.removeItem(k)
        window.sessionStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
  if (!next.analytics) {
    for (const k of ANALYTICS_KEYS) {
      try {
        window.sessionStorage.removeItem(k)
      } catch {
        /* ignore */
      }
    }
  }
  window.__shwurxApplyConsent?.(next)
  if (!prev || prev.analytics !== next.analytics || prev.ads !== next.ads) listeners.forEach((l) => l())
}

export function subscribeConsent(cb: () => void) {
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
