// Curated list of website text fields exposed in the Website Control Center.
// Each `path` is a dot-path into the i18n dictionary (see lib/i18n/dictionaries.ts).
// Editing here writes an override that is deep-merged over the shipped default,
// so an empty value simply falls back to the original wording.

export interface EditableField {
  path: string
  label: string
  /** render as a multi-line textarea instead of a single-line input */
  multiline?: boolean
}

export interface EditableGroup {
  group: string
  description?: string
  fields: EditableField[]
}

export const SITE_CONTENT_GROUPS: EditableGroup[] = [
  {
    group: "Hero (top of homepage)",
    description: "The first thing visitors see.",
    fields: [
      { path: "home.heroEyebrow", label: "Small label above the title" },
      { path: "home.heroTitle1", label: "Headline — line 1" },
      { path: "home.heroTitle2", label: "Headline — line 2" },
      { path: "home.heroSubtitle1", label: "Sub-headline — line 1" },
      { path: "home.heroSubtitle2", label: "Sub-headline — line 2" },
    ],
  },
  {
    group: "About section",
    fields: [
      { path: "home.aboutEyebrow", label: "Small label" },
      { path: "home.aboutTitle1", label: "Title — line 1" },
      { path: "home.aboutTitle2", label: "Title — line 2" },
      { path: "home.aboutBody", label: "Paragraph ({company} = your name)", multiline: true },
    ],
  },
  {
    group: "Brands & call-to-action",
    fields: [
      { path: "home.vehicleTypesHeading", label: "Vehicle types heading" },
      { path: "home.brandsHeading", label: "Brands heading" },
      { path: "home.brandsSub", label: "Brands sub-text", multiline: true },
      { path: "home.ctaTitle", label: "Call-to-action title" },
      { path: "home.ctaSubtitle", label: "Call-to-action subtitle" },
    ],
  },
  {
    group: "Brand slogan (header/footer)",
    fields: [
      { path: "brand.tagline", label: "Tagline" },
      { path: "brand.sloganSupport", label: "Support slogan" },
    ],
  },
  {
    group: "Buttons",
    fields: [
      { path: "cta.bookService", label: "Book a Service" },
      { path: "cta.getQuote", label: "Get a Quote" },
      { path: "cta.bookAppointment", label: "Book Appointment" },
      { path: "cta.contactUs", label: "Contact Us" },
      { path: "cta.trackCar", label: "Track your car" },
    ],
  },
]

/** Named image slots the control center can replace. */
export interface ImageSlot {
  key: string
  label: string
  hint: string
  fallback: string
}

export const SITE_IMAGE_SLOTS: ImageSlot[] = [
  {
    key: "home.hero",
    label: "Homepage hero image",
    hint: "Large banner at the top of the homepage. Landscape works best.",
    fallback: "/site/hero-porsche.png",
  },
  {
    key: "home.about",
    label: "About section image",
    hint: "Photo beside the About text.",
    fallback: "/site/about-tech.png",
  },
]

/** Read a dot-path value from a nested object; returns "" when missing. */
export function readPath(obj: unknown, path: string): string {
  let node: unknown = obj
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return ""
    }
  }
  return typeof node === "string" ? node : ""
}
