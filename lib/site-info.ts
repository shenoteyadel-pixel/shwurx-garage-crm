import { pick } from "@/lib/website/render"
import type { Lang, WebsiteDocument } from "@/lib/website/types"

/**
 * Public business identity for the marketing site, derived ONLY from the
 * published (or previewed) website document's Business fields — the same
 * source the header, footer and enquiry form use. Invoice/legal settings are
 * never read here; before the versioned site exists, the legacy document is
 * seeded from them (see lib/website/store.ts).
 */
export type PublicSiteInfo = {
  companyName: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  mapUrl: string | null
}

const FALLBACK_NAME = "SHWURX Auto Service Center"

export function publicSiteInfo(doc: WebsiteDocument, lang: Lang): PublicSiteInfo {
  const b = doc.business
  const orNull = (v: string) => (v.trim() ? v.trim() : null)
  return {
    companyName: pick(b.name, lang) || FALLBACK_NAME,
    phone: orNull(b.phone),
    whatsapp: orNull(b.whatsapp),
    email: orNull(b.email),
    address: orNull(pick(b.address, lang)),
    mapUrl: orNull(b.mapUrl),
  }
}
