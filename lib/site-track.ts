"use client"

/**
 * Client-side tracking + intake helpers for the public SHWURX website.
 * All calls hit the same-origin public ingestion endpoints, which write through
 * SECURITY DEFINER RPCs. No secrets are used here.
 *
 * Privacy rules: events carry the page path and campaign attribution only —
 * never names, phone numbers, emails, messages, VINs or tokenized URLs.
 */

declare global {
  interface Window {
    /** set by <TrackingGate>; false = master switch off or editor preview */
    __shwurxTrack?: boolean
    __shwurxThirdParty?: boolean
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const ATTR_KEY = "shwurx_attr_v2"

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
  return /^\/(track|approve|approval|customer-access|pay|portal)(\/|$)/.test(p) ? "/" : p.slice(0, 200)
}

/**
 * First-touch attribution for this browser session. Captured on the first
 * public page view; later UTM-tagged landings replace it (new campaign click).
 */
export function captureAttribution(): Attribution {
  const empty: Attribution = {
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
  try {
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
    const isCampaign = !!(fresh.utm_source || fresh.utm_campaign || fresh.gclid || fresh.gbraid || fresh.wbraid)
    const stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "null") as Attribution | null
    if (!stored || isCampaign) {
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(fresh))
      return fresh
    }
    return stored
  } catch {
    return empty
  }
}

export function getAttribution(): Attribution {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "null") as Attribution | null
    return stored ?? captureAttribution()
  } catch {
    return captureAttribution()
  }
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
    const attr = getAttribution()
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

/**
 * Third-party conversion signal (GTM dataLayer / gtag). Only called after the
 * server confirmed the enquiry was persisted, and only once per submission id.
 */
export function emitConversion(submissionId: string, context: { form: string; brand?: string | null; service?: string | null }) {
  try {
    const key = `shwurx_conv_${submissionId}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
    track("enquiry_persisted", { form: context.form, brand: context.brand ?? null, service: context.service ?? null })
    if (window.__shwurxThirdParty !== true) return
    const payload = { event: "generate_lead", form_id: context.form, brand: context.brand ?? undefined, service: context.service ?? undefined }
    if (window.dataLayer) window.dataLayer.push(payload)
    else if (window.gtag) window.gtag("event", "generate_lead", { form_id: context.form })
  } catch {
    /* best-effort */
  }
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string }
  if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong. Please try again.")
  return json
}

export function submitAppointment(payload: Record<string, unknown>) {
  return postJson("/api/public/appointments", payload)
}

export function submitLead(payload: Record<string, unknown>) {
  return postJson("/api/public/leads", payload)
}
