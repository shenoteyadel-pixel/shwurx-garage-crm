import { looksLikeContactData } from "./contact-shape"

/** Stable semantics; Website Center may rename the four conversion outputs. */
export const EVENT_KEYS = [
  "page_view", "navigation_click", "language_change", "phone_click", "whatsapp_click",
  "directions_click", "email_click", "social_click", "form_start", "form_validation_error",
  "form_submit_error", "generate_lead", "appointment_request_received", "faq_expand", "gallery_open",
] as const
export type EventKey = (typeof EVENT_KEYS)[number]
export const EVENT_KEY_SET: ReadonlySet<string> = new Set(EVENT_KEYS)
export const CONVERSION_EVENT_KEYS = {
  lead: "generate_lead", appointment: "appointment_request_received",
  phone_click: "phone_click", whatsapp_click: "whatsapp_click",
} as const
const conversionKeys = new Set<string>(Object.values(CONVERSION_EVENT_KEYS))
export const FIXED_EVENT_NAMES = new Set<string>(EVENT_KEYS.filter((key) => !conversionKeys.has(key)))

export function validConversionEventName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value)
    && !/^(google_|ga_|firebase_)/i.test(value)
    && !FIXED_EVENT_NAMES.has(value)
    && !looksLikeContactData(value)
}

/** Only the server's stable HMAC format is eligible for Ads deduplication. */
export function safeConversionToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value) ? value : null
}

/** Decode before validation; never truncate unsafe input into an apparently safe token. */
export function telemetryToken(value: unknown, max = 60): string | null {
  if (typeof value !== "string") return null
  let text = value.trim()
  try { text = decodeURIComponent(text) } catch { return null }
  if (looksLikeContactData(text) || /[?#]/.test(text)) return null
  text = text.toLowerCase()
  return text.length <= max && /^[a-z0-9][a-z0-9_-]*$/.test(text) ? text : null
}
