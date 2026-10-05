import { dictionaries } from "@/lib/i18n/dictionaries"
import type { WebsiteDocument } from "./types"

type Lang = "en" | "ar"
type Overrides = Record<string, unknown>

function str(o: Overrides, section: string, key: string): string | null {
  const s = o[section]
  if (!s || typeof s !== "object") return null
  const v = (s as Record<string, unknown>)[key]
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * The old Text editor saved overrides of dictionary keys (site_content.en/ar).
 * The versioned pages read their own fields, so copy each real override into
 * the matching page field. Fields with no override keep the new defaults.
 * Multi-part legacy strings (title1 + title2) are joined, using the shipped
 * default for whichever half was not overridden.
 */
export function migrateLegacyStrings(doc: WebsiteDocument): WebsiteDocument {
  const company = doc.business.name?.en || "SHWURX"
  for (const lang of ["en", "ar"] as Lang[]) {
    const o = (doc.strings?.[lang] ?? {}) as Overrides
    const d = dictionaries[lang] as unknown as Record<string, Record<string, unknown>>
    const get = (section: string, key: string) => str(o, section, key)
    const def = (section: string, key: string) => String(d[section]?.[key] ?? "")
    const fill = (text: string) => text.replaceAll("{company}", company)
    const joined = (section: string, a: string, b: string, sep: string) => {
      const ao = get(section, a)
      const bo = get(section, b)
      if (!ao && !bo) return null
      return fill([ao ?? def(section, a), bo ?? def(section, b)].filter(Boolean).join(sep))
    }

    const p = doc.pages
    const eyebrow = get("home", "heroEyebrow")
    if (eyebrow) p.home.eyebrow[lang] = fill(eyebrow)
    const title = joined("home", "heroTitle1", "heroTitle2", " ")
    if (title) p.home.title[lang] = title
    const subtitle = joined("home", "heroSubtitle1", "heroSubtitle2", " ")
    if (subtitle) p.home.subtitle[lang] = subtitle

    const aboutTitle = get("aboutPage", "title")
    if (aboutTitle) p.about.title[lang] = fill(aboutTitle)
    const aboutBody = joined("aboutPage", "body1", "body2", "\n\n")
    if (aboutBody) p.about.body[lang] = aboutBody

    const contactTitle = get("contactPage", "title")
    if (contactTitle) p.contact.title[lang] = fill(contactTitle)
    const contactIntro = get("contactPage", "intro")
    if (contactIntro) p.contact.intro[lang] = fill(contactIntro)

    const servicesTitle = get("servicesPage", "title")
    if (servicesTitle) p.servicesIndex.title[lang] = fill(servicesTitle)
    const servicesIntro = get("servicesPage", "intro")
    if (servicesIntro) p.servicesIndex.intro[lang] = fill(servicesIntro)
  }
  return doc
}
