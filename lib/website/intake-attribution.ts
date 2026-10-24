import { isPublicSitePath } from "./paths"
import { looksLikeContactData } from "./contact-shape"
import { googleAcquisitionIds } from "./google-acquisition-ids"

/**
 * Server-side revalidation of the browser's first/latest touches before they
 * are stored with a CRM lead or appointment. Pure: unit-testable.
 */

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u001f\u007f]/g
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CTRL, " ").trim().slice(0, max) : "")
const EIGHT_DIGIT_PHONE = /\d[\d\s().-]{6,}\d/
const CLICK_ID_RE = /^[A-Za-z0-9_-]{8,200}$/

/** A conservative date exception for named campaigns, not standalone numbers. */
function validCampaignDate(v: string): boolean {
  if (!/^20\d{6}$/.test(v)) return false
  const year = Number(v.slice(0, 4)), month = Number(v.slice(4, 6)), day = Number(v.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Campaign text without contact data; only the campaign name may contain a valid separated date token. */
function campaign(v: unknown, allowNamedDate = false): string | null {
  const s = str(v, 120)
  if (!s || looksLikeContactData(s)) return null
  let phoneView = s
  try { phoneView = decodeURIComponent(phoneView) } catch { /* keep raw */ }
  phoneView = phoneView.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)))
  if (allowNamedDate && /\p{L}/u.test(phoneView)) {
    phoneView = phoneView.replace(/(^|[_\s|-])(\d{8})(?=$|[_\s|-])/g,
      (whole, separator: string, date: string) => validCampaignDate(date) ? `${separator}date` : whole)
  }
  return EIGHT_DIGIT_PHONE.test(phoneView) ? null : s
}
const clickId = (v: unknown) => {
  const s = str(v, 200)
  return CLICK_ID_RE.test(s) ? s : null
}

/** Strips query strings (which may carry tokens) and refuses non-website paths. */
export function publicPath(v: unknown): string | null {
  const p = str(v, 200).split(/[?#]/)[0]
  return p.startsWith("/") && isPublicSitePath(p) ? p : null
}

export function sanitizedReferrer(v: unknown): string | null {
  const s = str(v, 300)
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null
  } catch {
    return null
  }
}

function timestamp(v: unknown, now: number): string | null {
  const s = str(v, 40)
  const t = Date.parse(s)
  // Reject future and implausibly old timestamps instead of trusting the client clock blindly.
  if (!s || Number.isNaN(t) || t > now + 5 * 60_000 || now - t > 400 * 86_400_000) return null
  return new Date(t).toISOString()
}

export function sanitizeTouch(a: unknown, now = Date.now()) {
  const o = a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : {}
  return {
    ...googleAcquisitionIds(o),
    utm: {
      source: campaign(o.utm_source),
      medium: campaign(o.utm_medium),
      campaign: campaign(o.utm_campaign, true),
      content: campaign(o.utm_content),
      term: campaign(o.utm_term),
    },
    click_ids: { gclid: clickId(o.gclid), gbraid: clickId(o.gbraid), wbraid: clickId(o.wbraid) },
    landing_path: publicPath(o.landingPath),
    referrer: sanitizedReferrer(o.referrer),
    at: timestamp(o.at, now),
  }
}

/** `{first, latest}` from the request body; each touch is validated independently. */
export function sanitizeAttribution(body: Record<string, unknown>, now = Date.now()) {
  const a = body.attribution && typeof body.attribution === "object" ? (body.attribution as Record<string, unknown>) : {}
  return { version: 4 as const, first_touch: sanitizeTouch(a.first, now), latest_touch: sanitizeTouch(a.latest, now) }
}
