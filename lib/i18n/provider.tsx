"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  dirFor,
  isLocale,
  isPublicPath,
  type Locale,
} from "./config"
import { getDictionary, interpolate, type Dict } from "./dictionaries"

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

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [lang, setLangState] = React.useState<Locale>(initialLang)

  // On first mount, honour a returning visitor's saved choice / device language
  // if no explicit cookie was set yet (the server already applied any cookie).
  React.useEffect(() => {
    if (typeof document === "undefined") return
    const hasCookie = document.cookie.includes(`${LOCALE_COOKIE}=`)
    if (hasCookie) return
    const stored = window.localStorage.getItem(LOCALE_COOKIE)
    const device = navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en"
    const detected: Locale = isLocale(stored) ? stored : device
    if (detected !== lang) {
      writeCookie(detected)
      window.localStorage.setItem(LOCALE_COOKIE, detected)
      setLangState(detected)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the document's lang/dir in sync. RTL is only applied on public routes
  // so the internal CRM always stays LTR regardless of the saved language.
  React.useEffect(() => {
    const el = document.documentElement
    const publicRoute = isPublicPath(pathname ?? "/")
    el.lang = publicRoute ? lang : "en"
    el.dir = publicRoute ? dirFor(lang) : "ltr"
  }, [lang, pathname])

  const setLang = React.useCallback(
    (next: Locale) => {
      if (next === lang) return
      writeCookie(next)
      window.localStorage.setItem(LOCALE_COOKIE, next)
      setLangState(next)
      // Re-render server components (pages/footer) with the new cookie.
      router.refresh()
    },
    [lang, router],
  )

  const value = React.useMemo<LangContextValue>(() => {
    const dict = getDictionary(lang)
    return {
      lang,
      dir: dirFor(lang),
      dict,
      t: dict,
      setLang,
      fmt: interpolate,
    }
  }, [lang, setLang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useI18n(): LangContextValue {
  const ctx = React.useContext(LangContext)
  if (!ctx) {
    // Safe fallback so a stray client component never crashes the tree.
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
