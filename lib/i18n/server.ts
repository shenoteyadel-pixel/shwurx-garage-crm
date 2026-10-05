import "server-only"
import { cookies, headers } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { getDictionary, mergeDict, type Dict } from "./dictionaries"
import { getSiteContentOverrides } from "@/lib/site-content"

/** Set by proxy.ts on public website routes: URL decides language (/ar = Arabic). */
export const SITE_LOCALE_HEADER = "x-site-locale"

/** True when the current request is a public website page (not the CRM). */
export async function isSiteRequest(): Promise<boolean> {
  const h = await headers()
  return isLocale(h.get(SITE_LOCALE_HEADER))
}

/**
 * Website pages: locale comes from the URL (via proxy header) so crawlers and
 * first-time visitors get the right language without a cookie.
 * CRM pages: the visitor's saved cookie.
 */
export async function getServerLocale(): Promise<Locale> {
  const h = await headers()
  const fromUrl = h.get(SITE_LOCALE_HEADER)
  if (isLocale(fromUrl)) return fromUrl
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * Get the current locale + its dictionary in one call (server components).
 * The dictionary has any Website-Control-Center text overrides merged in, so
 * server-rendered pages show the edited copy immediately after saving.
 */
export async function getServerI18n(): Promise<{ locale: Locale; dict: Dict }> {
  const locale = await getServerLocale()
  const overrides = await getSiteContentOverrides()
  const dict = mergeDict(getDictionary(locale), locale === "ar" ? overrides.ar : overrides.en)
  return { locale, dict }
}
