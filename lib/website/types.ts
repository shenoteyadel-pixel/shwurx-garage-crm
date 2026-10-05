/**
 * The single typed website document. One instance powers BOTH the Website
 * Control Center editor (draft) and public rendering (published revision).
 * Every operator-facing string is bilingual.
 */

export type Lang = "en" | "ar"
export type L10n = { en: string; ar: string }

export interface Faq {
  id: string
  q: L10n
  a: L10n
}

export interface TextItem {
  id: string
  title: L10n
  body: L10n
}

export interface SeoFields {
  title: L10n
  description: L10n
  /** media id of the Open Graph image */
  ogImageId: string | null
  noindex: boolean
}

export type MediaSource =
  | "workshop_original" // photographed at SHWURX, owner-approved
  | "existing_site_asset" // shipped with the previous site; origin must be reviewed
  | "brand_mark" // manufacturer logo used only to identify the brand
  | "upload"
  | "ai_illustration" // generated concept artwork; must be captioned as illustrative, never shown as real staff/work
  | "ai_generated" // AI composition from an owner-supplied reference; illustrative, never a real customer job

export type MediaApproval = "approved" | "needs_review" | "rejected"

export interface MediaAsset {
  id: string
  url: string
  source: MediaSource
  approval: MediaApproval
  alt: L10n
  caption: L10n
  tags: string[]
  width: number | null
  height: number | null
  /** 0–100 percentages, used for object-position */
  focalX: number
  focalY: number
  /** true only when the photo is safe to show publicly (no plates/customers) */
  publicSafe: boolean
  uploadedAt: string
}

export interface ModelScope {
  id: string
  name: string
  yearFrom: number
  /** null = current production */
  yearTo: number | null
  note: L10n
}

/** A real, documented job write-up. Never fabricated; empty by default. */
export interface CaseStudy {
  id: string
  title: L10n
  body: L10n
  mediaIds: string[]
  /** owner confirmed this happened and customer identifiers are removed */
  documented: boolean
}

export interface Brand {
  id: string
  slug: string
  name: L10n
  /** manufacturer, or a model family/sub-brand of a parent manufacturer */
  kind: "manufacturer" | "model_family"
  /** e.g. Corvette → "Chevrolet", Range Rover → "Land Rover" */
  parentName: L10n | null
  /** extra collections such as "sports" — collections are NOT manufacturers */
  collections: string[]
  logoId: string | null
  /** media id of the brand page hero; null = no hero */
  heroImageId: string | null
  yearFrom: number
  models: ModelScope[]
  intro: L10n
  /** brand-specific notes useful to an owner (systems, typical care points) */
  knowledge: TextItem[]
  serviceSlugs: string[]
  faqs: Faq[]
  galleryIds: string[]
  caseStudies: CaseStudy[]
  seo: SeoFields
  visible: boolean
}

export type ServiceKind =
  | "mechanical"
  | "diagnostics"
  | "bodywork"
  | "painting"
  | "programming_online"
  | "programming_offline"

export interface Service {
  id: string
  slug: string
  kind: ServiceKind
  name: L10n
  summary: L10n
  intro: L10n
  subservices: TextItem[]
  /** what the customer should know / bring before the visit */
  preparation: L10n
  steps: TextItem[]
  faqs: Faq[]
  /** limits that keep the page honest, e.g. capability depends on assessment */
  scopeNote: L10n
  galleryIds: string[]
  seo: SeoFields
  visible: boolean
}

export interface SocialLink {
  id: string
  label: string
  url: string
}

/** Public identity — deliberately separate from invoice/legal company settings. */
export interface BusinessInfo {
  name: L10n
  phone: string
  whatsapp: string
  email: string
  address: L10n
  area: L10n
  mapUrl: string
  /** unknown hours stay empty and are simply not shown */
  hours: L10n
  socials: SocialLink[]
  logoId: string | null
}

export interface NavLink {
  id: string
  label: L10n
  /** internal path WITHOUT locale prefix, e.g. "/brands" */
  href: string
  visible: boolean
}

export type HomeSectionKey = "hero" | "brands" | "services" | "process" | "team" | "blog" | "location"

export const HOME_SECTION_KEYS: readonly HomeSectionKey[] = ["hero", "brands", "services", "process", "team", "blog", "location"]

/** One homepage band. Array order is display order; heading/intro are owner-editable. */
export interface HomeSection {
  key: HomeSectionKey
  visible: boolean
  heading: L10n
  intro: L10n
}

export interface HomeCta {
  label: L10n
  /** internal path WITHOUT locale prefix */
  href: string
}

export type PageBlock =
  | { id: string; type: "text"; heading: L10n; body: L10n }
  | { id: string; type: "faq"; heading: L10n; faqs: Faq[] }
  | { id: string; type: "gallery"; heading: L10n; mediaIds: string[] }
  | { id: string; type: "cta"; heading: L10n; body: L10n }

export interface CustomPage {
  id: string
  slug: string
  template: "standard" | "landing"
  title: L10n
  intro: L10n
  blocks: PageBlock[]
  seo: SeoFields
  visible: boolean
  /** landing pages can prefill the enquiry form */
  brandSlug: string | null
  serviceSlug: string | null
}

/**
 * A real team member, entered by the owner. Never generated: empty slots are
 * drafts that only appear in the editor until they are complete and visible.
 */
export interface TeamMember {
  id: string
  name: L10n
  jobTitle: L10n
  bio: L10n
  department: L10n
  photoId: string | null
  visible: boolean
  archived: boolean
  sortOrder: number
  /** an unfinished slot's illustrative portrait may appear in the anonymous public strip */
  inStrip: boolean
}

export interface TeamPage {
  /** page switch; the page is only public when it also has a public member */
  visible: boolean
  title: L10n
  intro: L10n
  members: TeamMember[]
  /** show unfilled slots' AI portraits publicly, as a labelled illustrative strip (no names, no Person schema) */
  showIllustrative: boolean
  seo: SeoFields
}

export interface PagesContent {
  appointment: import("./appointment").AppointmentPageConfig
  home: {
    eyebrow: L10n
    title: L10n
    subtitle: L10n
    heroImageId: string | null
    primaryCta: HomeCta
    secondaryCta: HomeCta
    /** short proof points under the hero CTAs (facts only — no invented stats) */
    highlights: TextItem[]
    sections: HomeSection[]
    seo: SeoFields
  }
  about: { title: L10n; body: L10n; imageId: string | null; seo: SeoFields }
  contact: { title: L10n; intro: L10n; seo: SeoFields }
  brandsIndex: { title: L10n; intro: L10n; seo: SeoFields }
  servicesIndex: { title: L10n; intro: L10n; seo: SeoFields }
  privacy: { title: L10n; body: L10n; seo: SeoFields }
  team: TeamPage
  /** the shared inspection → quotation → approval process */
  process: TextItem[]
  custom: CustomPage[]
}

export interface Redirect {
  id: string
  from: string
  to: string
  permanent: boolean
}

export interface SeoSettings {
  siteName: L10n
  titleSuffix: L10n
  defaultDescription: L10n
  defaultOgImageId: string | null
  redirects: Redirect[]
}

export interface EnquiryFormConfig {
  heading: L10n
  intro: L10n
  labels: {
    name: L10n
    phone: L10n
    brand: L10n
    model: L10n
    year: L10n
    service: L10n
    details: L10n
    submit: L10n
  }
  privacyNote: L10n
  successTitle: L10n
  successBody: L10n
  nextSteps: L10n
  /** when false, the form is hidden and only call/WhatsApp remain */
  enabled: boolean
}

export interface WebsiteDocument {
  schemaVersion: 1
  business: BusinessInfo
  nav: { header: NavLink[]; footer: NavLink[] }
  pages: PagesContent
  brands: Brand[]
  services: Service[]
  media: MediaAsset[]
  seo: SeoSettings
  forms: { enquiry: EnquiryFormConfig; appointment: import("./appointment").AppointmentFormConfig }
  /** GA4 / GTM / Ads / Meta / Search Console — Website Center only */
  analytics: import("./analytics").AnalyticsConfig
  /** legacy dictionary overrides (previous site_content.en / .ar) */
  strings: { en: Record<string, unknown>; ar: Record<string, unknown> }
  /** legacy named image slots (previous site_content.images) */
  images: Record<string, string>
  /** additive seed packs already merged into this document (each applied at most once) */
  appliedSeeds: string[]
}

export interface RevisionSummary {
  id: number
  kind: "published" | "restored" | "imported" | "backup"
  draftVersion: number
  note: string | null
  createdAt: string
  createdByName: string | null
}
