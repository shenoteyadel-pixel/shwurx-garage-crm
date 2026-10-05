import "server-only"
import type { Metadata } from "next"
import { getServerLocale } from "@/lib/i18n/server"
import { getRenderDocument } from "./store"
import type { L10n, Lang, MediaAsset, SeoFields, WebsiteDocument } from "./types"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com").replace(/\/$/, "")

/** Arabic falls back to English only when the Arabic field is empty. */
export function pick(v: L10n | undefined, lang: Lang): string {
  if (!v) return ""
  return (lang === "ar" ? v.ar || v.en : v.en) ?? ""
}

/** Locale-aware internal path: English unprefixed, Arabic under /ar. */
export function localePath(lang: Lang, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path
  if (lang === "en") return path
  return path === "/" ? "/ar" : `/ar${path}`
}

/** Only approved, public-safe media is ever rendered publicly. */
export function publicMedia(doc: WebsiteDocument, id: string | null | undefined): MediaAsset | null {
  if (!id) return null
  const m = doc.media.find((x) => x.id === id)
  return m && m.approval === "approved" && m.publicSafe ? m : null
}

export async function siteContext() {
  const [lang, render] = await Promise.all([getServerLocale(), getRenderDocument()])
  return { lang, ...render }
}

export function buildMetadata(doc: WebsiteDocument, lang: Lang, path: string, seo: SeoFields): Metadata {
  const title = pick(seo.title, lang) + pick(doc.seo.titleSuffix, lang)
  const description = pick(seo.description, lang) || pick(doc.seo.defaultDescription, lang)
  const og = publicMedia(doc, seo.ogImageId) ?? publicMedia(doc, doc.seo.defaultOgImageId)
  const url = `${SITE_URL}${localePath(lang, path)}`
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}${localePath("en", path)}`,
        ar: `${SITE_URL}${localePath("ar", path)}`,
        "x-default": `${SITE_URL}${localePath("en", path)}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: pick(doc.seo.siteName, lang),
      locale: lang === "ar" ? "ar_AE" : "en_AE",
      images: og ? [{ url: og.url.startsWith("/") ? `${SITE_URL}${og.url}` : og.url, alt: pick(og.alt, lang) }] : undefined,
    },
    robots: seo.noindex ? { index: false, follow: true } : undefined,
  }
}
