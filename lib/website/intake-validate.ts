/**
 * Shared intake validation used by the public intake routes AND the website
 * forms, so client and server agree. Route files may only export Next route
 * handlers and config, so these live here. Must stay client-safe (no server imports).
 */

export const MIN_VEHICLE_YEAR = 2016

/** Raw phone input longer than this is rejected outright, never sliced into a "valid" number. */
export const MAX_PHONE_RAW = 24
export const PHONE_MIN_DIGITS = 7
export const PHONE_MAX_DIGITS = 15
/** Free-text details needed when no selected service or model supplies context. */
export const MIN_DETAILS_CHARS = 5

const ARABIC_INDIC = 0x0660
const PERSIAN_INDIC = 0x06f0

/** Arabic-Indic (٠-٩) and Persian/Urdu (۰-۹) digit glyphs to Latin 0-9; everything else untouched. */
export function toLatinDigits(input: string): string {
  return input.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (ch) => {
    const code = ch.charCodeAt(0)
    return String(code >= PERSIAN_INDIC ? code - PERSIAN_INDIC : code - ARABIC_INDIC)
  })
}

/**
 * Duplicate-identity digits: localized digits become Latin, separators drop,
 * an international 00 prefix drops, and a local UAE mobile (05XXXXXXXX)
 * becomes 9715XXXXXXXX, so 05…, +971… and 00971… share one identity.
 */
export function normalizePhone(raw: string): string {
  let d = toLatinDigits(raw).replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.startsWith("05") && d.length === 10) d = "971" + d.slice(1)
  return d
}

/** Characters a phone number may legitimately contain (digits in any supported script plus separators). */
const PHONE_CHARS = /^\+?[0-9\u0660-\u0669\u06f0-\u06f9\s().\-]+$/

export type PhoneResult =
  | { ok: true; value: string | null; digits: string | null }
  | { ok: false; error: "required" | "too_long" | "invalid" }

/**
 * Validates the RAW phone before any truncation. `value` is the trimmed input
 * with Latin digits (what is stored); `digits` is the duplicate identity.
 */
export function validatePhone(raw: unknown, opts: { required: boolean }): PhoneResult {
  if (raw === undefined || raw === null) return opts.required ? { ok: false, error: "required" } : { ok: true, value: null, digits: null }
  if (typeof raw !== "string") return { ok: false, error: "invalid" }
  const text = raw.trim()
  if (!text) return opts.required ? { ok: false, error: "required" } : { ok: true, value: null, digits: null }
  if (text.length > MAX_PHONE_RAW) return { ok: false, error: "too_long" }
  if (!PHONE_CHARS.test(text)) return { ok: false, error: "invalid" }
  const digits = normalizePhone(text)
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return { ok: false, error: "invalid" }
  return { ok: true, value: toLatinDigits(text), digits }
}

export type YearResult = { ok: true; year: number | null } | { ok: false; error: "invalid" | "out_of_range" }

/**
 * Validates the RAW year before any normalization: "20160" is rejected, never
 * truncated to 2016. Blank or whitespace-only is allowed (year is optional).
 * Arabic/Persian digits are accepted.
 */
export function validateVehicleYear(raw: unknown, now: Date = new Date()): YearResult {
  if (raw === undefined || raw === null) return { ok: true, year: null }
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? toLatinDigits(raw.trim()) : null
  if (text === null) return { ok: false, error: "invalid" }
  if (text === "") return { ok: true, year: null }
  if (!/^\d{4}$/.test(text)) return { ok: false, error: "invalid" }
  const year = Number(text)
  if (year < MIN_VEHICLE_YEAR || year > now.getFullYear() + 1) return { ok: false, error: "out_of_range" }
  return { ok: true, year }
}

/** The year string to submit: trimmed with Latin digits, or "" when blank. */
export function cleanYearInput(raw: string): string {
  return toLatinDigits(raw.trim())
}

/** True when nothing gives the workshop enough context: no service, no model and under 5 characters of details. */
export function needsMoreDetails(i: { service: string | null | undefined; model: string; details: string }): boolean {
  return !i.service && !i.model.trim() && i.details.trim().length < MIN_DETAILS_CHARS
}

/** Services selectable for a brand: all when no brand is chosen, else only the ones it offers. */
export function servicesForBrand<S extends { slug: string }>(
  services: S[],
  brand: { serviceSlugs: string[] } | null | undefined,
): S[] {
  return brand ? services.filter((s) => brand.serviceSlugs.includes(s.slug)) : services
}
