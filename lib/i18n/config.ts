export type Locale = "en" | "ar"

export const LOCALES: Locale[] = ["en", "ar"]
export const DEFAULT_LOCALE: Locale = "en"

/** Cookie that stores the visitor's language choice (readable by the server). */
export const LOCALE_COOKIE = "shwurx_lang"
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar"
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr"
}

/**
 * Public marketing/tracking routes where the Arabic RTL layout should apply.
 * The internal CRM stays LTR/English regardless of the saved preference.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true
  return ["/services", "/about", "/contact", "/appointment", "/track"].some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  )
}
