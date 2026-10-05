"use client"

/**
 * Client-side tracking + intake helpers for the public SHWURX website.
 * All calls hit the same-origin public ingestion endpoints, which write through
 * SECURITY DEFINER RPCs. No secrets are used here.
 *
 * Privacy rules: events carry the page path and campaign attribution only —
 * never names, phone numbers, emails, messages, VINs or tokenized URLs.
 */

import { isPublicSitePath } from "@/lib/website/paths"

declare global {
  interface Window {
    /** set by <TrackingGate>; false = master switch off or editor preview */
    __shwurxTrack?: boolean
    __shwurxThirdParty?: boolean
    /** which provider owns conversions: GTM container, direct GA4, or none */
    __shwurxTagMode?: "gtm" | "ga4" | "none"
    __shwurxTagsLoaded?: boolean
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const FIRST_KEY = "shwurx_touch_first_v3"
const LATEST_KEY = "shwurx_touch_latest_v3"

export interface Attribution {
  landingPath: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
}

function sessionId(): string | null {
  try {
    const key = "shwurx_sid"
    let sid = sessionStorage.getItem(key)
    if (!sid) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
      sessionStorage.setItem(key, sid)
    }
    return sid
  } catch {
    return null
  }
}

function clip(v: string | null, n = 120): string | null {
  return v ? v.slice(0, n) : null
}

/** Paths that must never be stored as attribution (tokenized customer links). */
function safePath(p: string): string {
  return isPublicSitePath(p) ? p.slice(0, 200) : "/"
}

export interface TouchAttribution {
  /** set once on the first public landing; never overwritten */
  first: Attribution
  /** replaced on every later campaign landing; equals first until then */
  latest: Attribution
}

const EMPTY: Attribution = {
  landingPath: null,
  referrer: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
}

function readTouch(store: Storage | null, key: string): Attribution | null {
  try {
    const v = JSON.parse(store?.getItem(key) || "null") as Attribution | null
    return v && typeof v === "object" ? v : null
  } catch {
    return null
  }
}

/**
 * Records attribution for this page view. First touch is persisted once (across
 * visits) and is immutable; latest touch moves only on a new campaign landing.
 */
export function captureAttribution(): TouchAttribution {
  try {
    const fresh = currentTouch()
    const isCampaign = !!(fresh.utm_source || fresh.utm_campaign || fresh.gclid || fresh.gbraid || fresh.wbraid)
    const store = markerStore()
    let first = readTouch(store, FIRST_KEY)
    if (!first) {
      first = fresh
      store?.setItem(FIRST_KEY, JSON.stringify(first))
    }
    let latest = readTouch(store, LATEST_KEY)
    if (!latest || isCampaign) {
      latest = fresh
      store?.setItem(LATEST_KEY, JSON.stringify(latest))
    }
    return { first, latest }
  } catch {
    return { first: EMPTY, latest: EMPTY }
  }
}

function currentTouch(): Attribution {
  {
    const params = new URLSearchParams(window.location.search)
    const fresh: Attribution = {
      landingPath: safePath(window.location.pathname),
      referrer: document.referrer && !document.referrer.startsWith(window.location.origin) ? clip(new URL(document.referrer).origin) : null,
      utm_source: clip(params.get("utm_source")),
      utm_medium: clip(params.get("utm_medium")),
      utm_campaign: clip(params.get("utm_campaign")),
      utm_content: clip(params.get("utm_content")),
      utm_term: clip(params.get("utm_term")),
      gclid: clip(params.get("gclid"), 200),
      gbraid: clip(params.get("gbraid"), 200),
      wbraid: clip(params.get("wbraid"), 200),
    }
    return fresh
  }
}

export function getAttribution(): TouchAttribution {
  const store = markerStore()
  const first = readTouch(store, FIRST_KEY)
  const latest = readTouch(store, LATEST_KEY)
  return first && latest ? { first, latest } : captureAttribution()
}

function device(): string {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/tablet|ipad/i.test(ua)) return "tablet"
  if (/mobi|android|iphone/i.test(ua)) return "mobile"
  return "desktop"
}

/**
 * First-party event. Silently does nothing when the master switch is off or an
 * editor is previewing. Metadata must not contain personal data.
 */
export function track(eventType: string, metadata: Record<string, unknown> = {}) {
  try {
    if (typeof window === "undefined" || window.__shwurxTrack !== true) return
    if (!isPublicSitePath(window.location.pathname)) return
    const attr = getAttribution().latest
    const body = JSON.stringify({
      eventType,
      sessionId: sessionId(),
      pagePath: safePath(window.location.pathname),
      referrer: attr.referrer,
      source: attr.utm_source,
      medium: attr.utm_medium,
      campaign: attr.utm_campaign,
      device: device(),
      metadata,
    })
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/track", new Blob([body], { type: "application/json" }))
    } else {
      void fetch("/api/public/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    }
  } catch {
    /* tracking is best-effort */
  }
}

function markerStore(): Storage | null {
  try {
    return window.localStorage
  } catch {
    try {
      return window.sessionStorage
    } catch {
      return null
    }
  }
}

/**
 * Conversion signal for a VERIFIED persisted lead. Keyed by the durable lead id
 * (persisted across reloads), so a lost success response followed by a retry
 * that returns "duplicate" with the same id counts exactly once.
 */
export function emitConversion(leadId: string, context: { form: string; brand?: string | null; service?: string | null }) {
  try {
    if (!leadId) return
    const store = markerStore()
    const firstKey = `shwurx_conv1_${leadId}`
    if (!store?.getItem(firstKey)) {
      track("enquiry_persisted", { form: context.form, brand: context.brand ?? null, service: context.service ?? null })
      store?.setItem(firstKey, "1")
    }
    if (window.__shwurxThirdParty !== true) return
    const key = `shwurx_conv3_${leadId}`
    if (store?.getItem(key) || inFlight.has(key)) return
    inFlight.add(key)
    dispatchThirdParty(key, context, 0)
  } catch {
    /* best-effort */
  }
}

/** Conversions waiting for a provider to become ready, keyed by durable lead id. */
const inFlight = new Set<string>()

/**
 * Sends generate_lead to exactly one provider, chosen by configuration (never
 * by whichever global happens to exist). Waits for the tag to be ready and only
 * marks the conversion as sent once a provider has accepted it. Every attempt
 * rechecks the durable marker, so another tab/caller that already sent it wins.
 */
function dispatchThirdParty(key: string, context: { form: string; brand?: string | null; service?: string | null }, attempt: number) {
  if (markerStore()?.getItem(key)) {
    inFlight.delete(key)
    return
  }
  const mode = window.__shwurxTagMode ?? "none"
  let accepted = false
  if (mode === "gtm" && Array.isArray(window.dataLayer)) {
    // GTM drains the dataLayer queue once its container loads.
    window.dataLayer.push({ event: "generate_lead", form_id: context.form, brand: context.brand ?? undefined, service: context.service ?? undefined })
    accepted = true
  } else if (mode === "ga4" && typeof window.gtag === "function") {
    window.gtag("event", "generate_lead", { form_id: context.form, brand: context.brand ?? undefined, service: context.service ?? undefined })
    accepted = true
  }
  if (accepted) {
    markerStore()?.setItem(key, "1")
    inFlight.delete(key)
    return
  }
  if (mode !== "none" && attempt < 20) {
    window.setTimeout(() => dispatchThirdParty(key, context, attempt + 1), 500)
    return
  }
  // Gave up; a later emitConversion (e.g. after reload) may try again.
  inFlight.delete(key)
}

/** "received" always carries the persisted record id; "dry_run" never does. */
export type IntakeResult = { outcome: "received"; id: string } | { outcome: "dry_run"; id: null }

async function postJson(url: string, payload: Record<string, unknown>): Promise<IntakeResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; outcome?: string; id?: unknown; error?: string }
  if (res.ok && json.outcome === "dry_run") return { outcome: "dry_run", id: null }
  if (res.ok && json.ok && json.outcome === "received" && typeof json.id === "string" && json.id) {
    return { outcome: "received", id: json.id }
  }
  throw new Error(json.error || "Something went wrong. Please try again.")
}

export function submitAppointment(payload: Record<string, unknown>) {
  return postJson("/api/public/appointments", payload)
}

export function submitLead(payload: Record<string, unknown>) {
  return postJson("/api/public/leads", payload)
}
