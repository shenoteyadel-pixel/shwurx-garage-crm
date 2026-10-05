import { isPublicSitePath } from "./paths"

/**
 * Pure validation for the public first-party analytics endpoint. Everything
 * the browser sends is untrusted: only allowlisted event names, a normalized
 * public pathname, an origin-only referrer, bounded campaign values and a
 * fixed set of short metadata tokens survive.
 */

export const TRACK_EVENTS: ReadonlySet<string> = new Set([
  "page_view",
  "cta_click",
  "navigation_click",
  "language_change",
  "phone_click",
  "whatsapp_click",
  "directions_click",
  "email_click",
  "social_click",
  "form_start",
  "form_validation_error",
  "form_submit_error",
  "enquiry_persisted",
  "appointment_persisted",
  "faq_expand",
  "gallery_open",
])

const METADATA_KEYS = [
  "placement",
  "form_key",
  "form_context",
  "destination",
  "platform",
  "error_code",
  "brand_slug",
  "service_slug",
  "locale",
  "page_type",
] as const

const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/
const SESSION = /^[A-Za-z0-9-]{8,64}$/
const DEVICES = new Set(["mobile", "tablet", "desktop"])

export interface TrackRecord {
  eventType: string
  sessionId: string | null
  pagePath: string
  referrer: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  device: string
  metadata: Record<string, string>
}

export type TrackParse = { ok: true; record: TrackRecord } | { ok: false; error: string }

/** Pathname only: query and hash removed, decoded once, collapsed slashes, no trailing slash. */
export function normalizePublicPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let p = raw.trim()
  if (!p || p.length > 512) return null
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname
    } catch {
      return null
    }
  }
  p = p.split(/[?#]/)[0]
  try {
    p = decodeURIComponent(p)
  } catch {
    return null
  }
  if (!p.startsWith("/") || p.startsWith("//") || /[\u0000-\u001f\\]/.test(p)) return null
  p = p.replace(/\/{2,}/g, "/")
  if (p.length > 1) p = p.replace(/\/+$/, "")
  if (p.split("/").some((s) => s === "..")) return null
  return isPublicSitePath(p) ? p : null
}

export function originOnly(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null
  } catch {
    return null
  }
}

function campaignValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 100)
  return v || null
}

export function parseTrackBody(body: Record<string, unknown>, userAgent: string): TrackParse {
  const eventType = String(body.eventType ?? body.event_type ?? "").trim().replace(/-/g, "_")
  if (!TRACK_EVENTS.has(eventType)) return { ok: false, error: "unknown_event" }
  const pagePath = normalizePublicPath(body.pagePath ?? body.page_path)
  if (!pagePath) return { ok: false, error: "non_public_path" }

  const metadata: Record<string, string> = {}
  const raw = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? (body.metadata as Record<string, unknown>) : {}
  for (const k of METADATA_KEYS) {
    const v = raw[k]
    if (typeof v === "string" && TOKEN.test(v)) metadata[k] = v
  }

  const sid = body.sessionId ?? body.session_id
  const dev = typeof body.device === "string" && DEVICES.has(body.device) ? body.device : null
  const device = dev ?? (/tablet|ipad/i.test(userAgent) ? "tablet" : /mobile/i.test(userAgent) ? "mobile" : "desktop")

  return {
    ok: true,
    record: {
      eventType,
      sessionId: typeof sid === "string" && SESSION.test(sid) ? sid : null,
      pagePath,
      referrer: originOnly(body.referrer),
      source: campaignValue(body.source),
      medium: campaignValue(body.medium),
      campaign: campaignValue(body.campaign),
      device,
      metadata,
    },
  }
}
