import "server-only"
import { cookies } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { getDictionary, mergeDict, type Dict } from "./dictionaries"
import { getSiteContentOverrides } from "@/lib/site-content"

/** Read the visitor's saved locale from the cookie (server components). */
export async function getServerLocale(): Promise<Locale> {
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
