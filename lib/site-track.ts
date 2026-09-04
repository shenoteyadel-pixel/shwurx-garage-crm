"use client"

/**
 * Client-side tracking + intake helpers for the public SHWURX website.
 * All calls hit the same-origin public ingestion endpoints, which write through
 * SECURITY DEFINER RPCs. No secrets are used here.
 */

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

function attribution() {
  try {
    const params = new URLSearchParams(window.location.search)
    const utm = {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
    }
    const stored = JSON.parse(sessionStorage.getItem("shwurx_attr") || "null")
    if (!stored && (utm.source || utm.medium || utm.campaign)) {
      sessionStorage.setItem("shwurx_attr", JSON.stringify(utm))
      return utm
    }
    return stored || utm
  } catch {
    return { source: null, medium: null, campaign: null }
  }
}

function device(): string {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/tablet|ipad/i.test(ua)) return "tablet"
  if (/mobi|android|iphone/i.test(ua)) return "mobile"
  return "desktop"
}

export function track(eventType: string, metadata: Record<string, unknown> = {}) {
  try {
    const attr = attribution()
    const body = JSON.stringify({
      eventType,
      sessionId: sessionId(),
      pagePath: window.location.pathname,
      referrer: document.referrer || null,
      source: attr.source,
      medium: attr.medium,
      campaign: attr.campaign,
      device: device(),
      metadata,
    })
    // Prefer sendBeacon so navigations don't cancel the request.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/track", new Blob([body], { type: "application/json" }))
    } else {
      void fetch("/api/public/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    }
  } catch {
    /* tracking is best-effort */
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
