"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  dirFor,
  isLocale,
  type Locale,
} from "./config"
import { getDictionary, mergeDict, interpolate, type Dict } from "./dictionaries"
import { isSitePath, stripLocale, switchLocalePath } from "@/lib/website/paths"

/** Editable text overrides for each locale, passed from the server layout. */
export type DictOverrides = { en?: Record<string, unknown>; ar?: Record<string, unknown> }

type LangContextValue = {
  lang: Locale
  dir: "ltr" | "rtl"
  dict: Dict
  /** Alias of `dict` — the active translation dictionary. */
  t: Dict
  setLang: (next: Locale) => void
  /** Interpolate {token} placeholders in a translated string. */
  fmt: (template: string, vars: Record<string, string | number>) => string
}

const LangContext = React.createContext<LangContextValue | null>(null)

function writeCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`
}

/** On public website pages the URL is the only source of language. */
function urlLocale(pathname: string | null): Locale | null {
  if (!pathname) return null
  const { lang, path } = stripLocale(pathname)
  return isSitePath(path) ? lang : null
}

export function LanguageProvider({
  initialLang,
  overrides,
  children,
}: {
  initialLang: Locale
  overrides?: DictOverrides
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const fromUrl = urlLocale(pathname)
  const [crmLang, setCrmLang] = React.useState<Locale>(initialLang)
  const lang: Locale = fromUrl ?? crmLang

  // CRM only: honour a returning visitor's saved choice / device language when
  // no cookie exists yet. Website pages never auto-switch away from their URL.
  React.useEffect(() => {
    if (fromUrl) return
    if (document.cookie.includes(`${LOCALE_COOKIE}=`)) return
    const stored = window.localStorage.getItem(LOCALE_COOKIE)
    const device = navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en"
    const detected: Locale = isLocale(stored) ? stored : device
    if (detected !== crmLang) {
      writeCookie(detected)
      window.localStorage.setItem(LOCALE_COOKIE, detected)
      setCrmLang(detected)
      // Deferred: refreshing before the App Router initialises throws.
      const id = window.setTimeout(() => router.refresh(), 0)
      return () => window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const el = document.documentElement
    el.lang = lang
    el.dir = dirFor(lang)
  }, [lang, pathname])

  const setLang = React.useCallback(
    (next: Locale) => {
      if (next === lang) return
      if (pathname && fromUrl) {
        const target = switchLocalePath(pathname, next)
        if (target) {
          // Full navigation so metadata, canonical and hreflang are re-rendered
          // for the new URL. Query and hash are preserved.
          window.location.assign(target + window.location.search + window.location.hash)
          return
        }
      }
      writeCookie(next)
      window.localStorage.setItem(LOCALE_COOKIE, next)
      setCrmLang(next)
      router.refresh()
    },
    [lang, pathname, fromUrl, router],
  )

  const value = React.useMemo<LangContextValue>(() => {
    const dict = mergeDict(getDictionary(lang), lang === "ar" ? overrides?.ar : overrides?.en)
    return {
      lang,
      dir: dirFor(lang),
      dict,
      t: dict,
      setLang,
      fmt: interpolate,
    }
  }, [lang, setLang, overrides])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useI18n(): LangContextValue {
  const ctx = React.useContext(LangContext)
  if (!ctx) {
    const dict = getDictionary(DEFAULT_LOCALE)
    return {
      lang: DEFAULT_LOCALE,
      dir: "ltr",
      dict,
      t: dict,
      setLang: () => {},
      fmt: interpolate,
    }
  }
  return ctx
}
