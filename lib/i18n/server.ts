import "server-only"
import { cookies } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { getDictionary, type Dict } from "./dictionaries"

/** Read the visitor's saved locale from the cookie (server components). */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Get the current locale + its dictionary in one call (server components). */
export async function getServerI18n(): Promise<{ locale: Locale; dict: Dict }> {
  const locale = await getServerLocale()
  return { locale, dict: getDictionary(locale) }
}
