import type { Lang, WebsiteDocument } from "./types"

/** Public aliases people search for; SHWURX stays the canonical name. */
export const SITE_ALIASES = ["Wurx Garage", "Wurx"] as const
export const LEGAL_NAME = "SHENOTEY ESKANDER GARAGE CO."
export const CANONICAL_NAME = "SHWURX"

export const websiteId = (origin: string) => `${origin}/#website`
export const businessId = (origin: string) => `${origin}/#business`

type Picker = (v: { en: string; ar: string } | undefined, lang: Lang) => string

interface GraphInput {
  doc: WebsiteDocument
  lang: Lang
  origin: string
  pick: Picker
  /** absolute logo URL from published media, if any */
  logoUrl?: string | null
}

const isHttps = (u: string) => /^https:\/\/[^\s]+$/.test(u)

/**
 * One WebSite node linked to one AutoRepair node. Only verified, already
 * published business data is used; empty values are omitted, never invented.
 */
export function buildSiteGraph({ doc, lang, origin, pick, logoUrl }: GraphInput) {
  const b = doc.business
  const name = pick(b.name, lang) || CANONICAL_NAME
  const street = pick(b.address, lang)
  const sameAs = b.socials.map((s) => s.url).filter(isHttps)
  const business: Record<string, unknown> = {
    "@type": "AutoRepair",
    "@id": businessId(origin),
    name,
    legalName: LEGAL_NAME,
    alternateName: [...SITE_ALIASES],
    url: `${origin}/`,
  }
  if (street) {
    business.address = { "@type": "PostalAddress", streetAddress: street, addressLocality: "Dubai", addressCountry: "AE" }
  }
  if (b.phone) business.telephone = b.phone
  if (b.email) business.email = b.email
  if (logoUrl) {
    business.logo = logoUrl
    business.image = logoUrl
  }
  if (isHttps(b.mapUrl)) business.hasMap = b.mapUrl
  if (sameAs.length) business.sameAs = sameAs

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId(origin),
        name: CANONICAL_NAME,
        alternateName: [...SITE_ALIASES],
        url: `${origin}/`,
        inLanguage: lang === "ar" ? "ar-AE" : "en-AE",
        publisher: { "@id": businessId(origin) },
      },
      business,
    ],
  }
}

/** Safe for <script type="application/ld+json">: blocks </script> and HTML-comment breakouts. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
