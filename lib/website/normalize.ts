import type { MediaSource, WebsiteDocument } from "./types"
import { brandHeroId } from "./seed-brands"
import {
  blankTeamMember,
  BRAND_HERO_SEED,
  brandHeroMedia,
  HERO_CONCEPT_ID,
  HOME_SECTION_DEFAULTS,
  ILLUSTRATIVE_SEED,
  illustrativeMedia,
  illustrativePortraitId,
  seedDocument,
  TEAM_NAV_FOOTER,
  TEAM_NAV_HEADER,
  TEAM_SCAFFOLD_SIZE,
  teamSlotId,
} from "./seed"
import { analyticsIssues, sanitizeAnalytics } from "./analytics"

const MAX_STR = 8000
const MAX_ITEMS = 300
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Backslashes, whitespace and control characters let browsers reinterpret a
// "relative" path as another origin (e.g. "/\evil.example").
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\\\u0000-\u001f\u007f\s]/
const PROBE = "https://probe.invalid"

/** A same-site path such as "/brands/porsche?x=1#faq". */
export function safeInternalPath(v: string): string {
  const s = v.trim()
  if (!s.startsWith("/") || s.startsWith("//") || UNSAFE_CHARS.test(s)) return ""
  // Encoded separators can become "//host" after a redirector decodes them.
  if (/%(2f|5c|00)/i.test(s)) return ""
  try {
    const u = new URL(s, PROBE)
    return u.origin === PROBE ? u.pathname + u.search + u.hash : ""
  } catch {
    return ""
  }
}

/** Absolute https URL (external links, maps, uploaded media). */
export function safeHttpsUrl(v: string): string {
  const s = v.trim()
  if (!s || UNSAFE_CHARS.test(s)) return ""
  try {
    const u = new URL(s)
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password ? u.href : ""
  } catch {
    return ""
  }
}

/** Media may be a site-relative asset or an https URL. */
export function safeMediaUrl(v: string): string {
  return safeInternalPath(v) || safeHttpsUrl(v)
}

/** Link targets: internal path, https, tel or mailto. */
export function safeUrl(v: string): string {
  const s = v.trim()
  if (!s) return ""
  if (s.startsWith("/")) return safeInternalPath(s)
  if (/^tel:\+?[0-9 ()-]{3,30}$/.test(s)) return s.replace(/[ ()-]/g, "")
  if (/^mailto:[^\s@\\]+@[^\s@\\]+\.[^\s@\\]+$/.test(s)) return s
  return safeHttpsUrl(s)
}

const URL_KEYS = new Set(["url", "href", "mapUrl", "from", "to"])

function sanitize(value: unknown, key: string, depth: number): unknown {
  if (depth > 12) return null
  if (typeof value === "string") {
    const s = value.slice(0, MAX_STR)
    return URL_KEYS.has(key) ? safeUrl(s) : s
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => sanitize(v, key, depth + 1))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue
      out[k] = sanitize(v, k, depth + 1)
    }
    return out
  }
  return null
}

const L = { en: "", ar: "" }
/** Must mirror SeoFields exactly: shape() keeps only template keys. */
const SEO: import("./types").SeoFields = { title: L, description: L, ogImageId: null, noindex: false }

/**
 * Item templates for arrays that are empty in the seed (so the seed cannot
 * describe their items). Keyed by the array's property name.
 */
const ITEM_TEMPLATES: Record<string, unknown> = {
  custom: {
    id: "",
    slug: "",
    template: "standard",
    title: L,
    intro: L,
    visible: false,
    blocks: [],
    seo: SEO,
    brandSlug: null,
    serviceSlug: null,
  },
  faqs: { id: "", q: L, a: L },
  members: blankTeamMember("", 0),
  caseStudies: { id: "", title: L, body: L, mediaIds: [""], documented: false },
  redirects: { from: "", to: "", permanent: true },
  galleryIds: "",
  mediaIds: "",
  tags: "",
  usedBy: "",
}

const ENUMS: Record<string, readonly string[]> = {
  approval: ["approved", "needs_review", "rejected"],
  source: ["workshop_original", "existing_site_asset", "brand_mark", "upload", "ai_illustration", "ai_generated"] satisfies MediaSource[],
  template: ["standard", "landing"],
}

/** Discriminated PageBlock variants; an unknown `type` is reported, never kept. */
const BLOCK_TEMPLATES: Record<string, unknown> = {
  text: { id: "", type: "text", heading: L, body: L },
  faq: { id: "", type: "faq", heading: L, faqs: [] },
  gallery: { id: "", type: "gallery", heading: L, mediaIds: [] },
  cta: { id: "", type: "cta", heading: L, body: L },
}

function shapeBlocks(input: unknown, drops: string[] | undefined, path: string): unknown[] {
  if (!Array.isArray(input)) return []
  const out: unknown[] = []
  input.forEach((v, i) => {
    const at = `${path}[${i}]`
    const type = isObj(v) ? (v as Record<string, unknown>).type : undefined
    const tpl = typeof type === "string" ? BLOCK_TEMPLATES[type] : undefined
    if (!tpl) {
      drops?.push(`${at}: block type must be one of ${Object.keys(BLOCK_TEMPLATES).join(", ")}`)
      return
    }
    const shaped = shape(v, tpl, "", drops, at) as Record<string, unknown>
    // Only the variant's own keys survive, so stale fields from another type can't leak.
    const strict: Record<string, unknown> = {}
    for (const k of Object.keys(tpl as object)) strict[k] = shaped[k]
    strict.type = type
    out.push(strict)
  })
  return out
}

const NULLABLE_SLUGS = new Set(["brandSlug", "serviceSlug"])
/** Schema-nullable media references: explicit null must never inherit another item's value. */
const NULLABLE_IDS = new Set(["logoId", "ogImageId", "heroImageId", "imageId", "defaultOgImageId", "photoId"])
const NULLABLE_NUMS = new Set(["width", "height", "yearTo"])

/** Shape `input` like `template`: wrong types fall back to the template value. */
function shape(input: unknown, template: unknown, key = "", drops?: string[], path = ""): unknown {
  if (key === "blocks") return shapeBlocks(input, drops, path)
  if (NULLABLE_SLUGS.has(key)) return typeof input === "string" && SLUG_RE.test(input) ? input : null
  if (NULLABLE_IDS.has(key)) return typeof input === "string" && input.trim() ? input : null
  if (NULLABLE_NUMS.has(key)) return typeof input === "number" && Number.isFinite(input) ? input : null
  if (key === "parentName") return isObj(input) ? shape(input, L, "", drops, path) : null
  if (template === null || template === undefined) return input ?? template
  if (typeof template === "string") {
    if (typeof input !== "string") return template
    if (ENUMS[key] && !ENUMS[key].includes(input)) {
      drops?.push(`${path}: "${input}" is not an allowed value`)
      return template
    }
    return input
  }
  if (typeof template === "number") return typeof input === "number" ? input : template
  if (typeof template === "boolean") return typeof input === "boolean" ? input : template
  if (Array.isArray(template)) {
    if (!Array.isArray(input)) return template
    // Seeded team slots carry ids, so new members must not inherit slot 01's id.
    const itemTpl = key === "members" ? ITEM_TEMPLATES.members : (template[0] ?? ITEM_TEMPLATES[key])
    if (itemTpl === undefined) return input.filter((v) => typeof v === "string")
    const isObjTpl = typeof itemTpl === "object" && itemTpl !== null
    const out: unknown[] = []
    input.forEach((v, i) => {
      const ok = isObjTpl ? isObj(v) : typeof v === typeof itemTpl
      if (!ok) {
        drops?.push(`${path}[${i}]: expected ${isObjTpl ? "an object" : typeof itemTpl}`)
        return
      }
      out.push(shape(v, itemTpl, key, drops, `${path}[${i}]`))
    })
    return out
  }
  if (typeof template === "object") {
    const src = isObj(input) ? (input as Record<string, unknown>) : {}
    const out: Record<string, unknown> = { ...src }
    for (const [k, tv] of Object.entries(template as Record<string, unknown>)) {
      out[k] = shape(src[k], tv, k, drops, path ? `${path}.${k}` : k)
    }
    return out
  }
  return input
}

/**
 * Strict entry point for saves: malformed items are reported (not silently
 * persisted) together with broken IDs and relations.
 */
export function parseDocument(
  input: unknown,
): { ok: true; doc: WebsiteDocument } | { ok: false; issues: ValidationIssue[] } {
  if (!isObj(input)) return { ok: false, issues: [{ level: "error", where: "Document", message: "Expected an object." }] }
  const drops: string[] = []
  const doc = normalizeDocument(input, drops)
  const issues: ValidationIssue[] = drops.map((d) => ({ level: "error", where: d.split(":")[0], message: d }))
  const ids = new Set<string>()
  for (const m of doc.media) {
    if (!m.id || ids.has(m.id)) issues.push({ level: "error", where: "Media", message: `Missing or duplicate media id "${m.id}".` })
    ids.add(m.id)
    if (!safeMediaUrl(m.url)) issues.push({ level: "error", where: `Media ${m.id}`, message: "Image URL must be a site path or https." })
  }
  for (const owner of [...doc.brands, ...doc.services]) {
    for (const g of owner.galleryIds) {
      if (!ids.has(g)) issues.push({ level: "warning", where: owner.slug, message: `Gallery references missing photo "${g}".` })
    }
  }
  const caseIds = new Set<string>()
  for (const b of doc.brands) {
    for (const c of b.caseStudies) {
      if (!c.id || caseIds.has(c.id)) issues.push({ level: "error", where: `Brand: ${b.slug}`, message: "Case study needs a unique id." })
      caseIds.add(c.id)
    }
  }
  const memberIds = new Set<string>()
  for (const m of doc.pages.team.members) {
    if (!m.id || memberIds.has(m.id)) issues.push({ level: "error", where: "Team", message: `Missing or duplicate team member id "${m.id}".` })
    memberIds.add(m.id)
  }
  return issues.some((i) => i.level === "error") ? { ok: false, issues } : { ok: true, doc }
}

export function normalizeDocument(input: unknown, drops?: string[]): WebsiteDocument {
  const seed = seedDocument()
  const clean = sanitize(input, "", 0)
  const doc = shape(clean, seed, "", drops) as WebsiteDocument
  // Free-form legacy dictionary overrides keep their own nested shape.
  const raw = (clean && typeof clean === "object" ? (clean as Record<string, unknown>) : {}) as {
    strings?: { en?: unknown; ar?: unknown }
    images?: unknown
    analytics?: unknown
  }
  // Provider IDs have strict formats; the generic shaper would accept any string.
  doc.analytics = sanitizeAnalytics(raw.analytics, drops)
  doc.strings = {
    en: isObj(raw.strings?.en) ? (raw.strings!.en as Record<string, unknown>) : {},
    ar: isObj(raw.strings?.ar) ? (raw.strings!.ar as Record<string, unknown>) : {},
  }
  doc.images = {}
  if (isObj(raw.images)) {
    for (const [k, v] of Object.entries(raw.images as Record<string, unknown>)) {
      const u = typeof v === "string" ? safeMediaUrl(v) : ""
      if (u) doc.images[k] = u
    }
  }
  migrateTeam(doc, clean)
  migrateHomeSections(doc, clean)
  applyIllustrativeSeed(doc, clean)
  applyBrandHeroSeed(doc, clean)
  doc.schemaVersion = 1
  return doc
}

/**
 * Keeps stored order/visibility. Sections saved before headings existed get the
 * default copy for THEIR key (the generic shaper would copy the first item's),
 * unknown or duplicate keys are dropped, and newly added bands are appended once.
 */
export function migrateHomeSections(doc: WebsiteDocument, clean: unknown) {
  const rawHome = isObj(clean) ? (clean as { pages?: { home?: { sections?: unknown } } }).pages?.home : undefined
  const rawSections = Array.isArray(rawHome?.sections) ? (rawHome!.sections as unknown[]).filter(isObj) : []
  const defaults = new Map(HOME_SECTION_DEFAULTS.map((s) => [s.key, s]))
  const seen = new Set<string>()
  const out: WebsiteDocument["pages"]["home"]["sections"] = []
  doc.pages.home.sections.forEach((s, i) => {
    const def = defaults.get(s.key)
    if (!def || seen.has(s.key)) return
    seen.add(s.key)
    const raw = (rawSections[i] ?? {}) as Record<string, unknown>
    out.push({
      key: s.key,
      visible: s.visible,
      heading: isObj(raw.heading) ? s.heading : structuredClone(def.heading),
      intro: isObj(raw.intro) ? s.intro : structuredClone(def.intro),
    })
  })
  for (const def of HOME_SECTION_DEFAULTS) {
    if (seen.has(def.key)) continue
    // insert new bands just before "location" so contact stays last
    const at = out.findIndex((s) => s.key === "location")
    out.splice(at < 0 ? out.length : at, 0, structuredClone(def))
  }
  doc.pages.home.sections = out
}

/**
 * Documents saved before the Team page existed get the 18 draft slots (via the
 * seed template) and the nav links exactly once. A stored Team block, even
 * with a deliberately empty member list, is never re-scaffolded.
 */
function migrateTeam(doc: WebsiteDocument, clean: unknown) {
  const rawPages = isObj(clean) ? (clean as { pages?: unknown }).pages : undefined
  const hadTeam = isObj(rawPages) && isObj((rawPages as { team?: unknown }).team)
  if (!hadTeam && isObj(clean) && isObj((clean as { nav?: unknown }).nav)) {
    if (!doc.nav.header.some((l) => l.href === "/team")) {
      const at = doc.nav.header.findIndex((l) => l.href === "/about")
      doc.nav.header.splice(at < 0 ? doc.nav.header.length : at + 1, 0, structuredClone(TEAM_NAV_HEADER))
    }
    if (!doc.nav.footer.some((l) => l.href === "/team")) {
      const at = doc.nav.footer.findIndex((l) => l.href === "/contact")
      doc.nav.footer.splice(at < 0 ? doc.nav.footer.length : at, 0, structuredClone(TEAM_NAV_FOOTER))
    }
  }
  doc.pages.team.members = doc.pages.team.members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.sortOrder - b.m.sortOrder || a.i - b.i)
    .map(({ m }, i) => ({ ...m, sortOrder: i, inStrip: (m as { inStrip?: unknown }).inStrip !== false }))
}

/**
 * Members whose illustrative portrait is publicly shown in the anonymous strip:
 * page switch on, strip switch on, unfinished, not archived, included, AI photo.
 */
export function illustrativeStripMembers(doc: WebsiteDocument): import("./types").TeamMember[] {
  const page = doc.pages.team
  if (!page.visible || !page.showIllustrative) return []
  return [...page.members]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((m) => !m.archived && m.inStrip && !isPublicTeamMember(m) && isIllustrativeMedia(doc, m.photoId))
}

/**
 * Additive, once-only merge of the illustrative hero + 18 portraits into older
 * documents. Never overwrites: media is appended by missing id, a portrait is
 * attached only to an untouched seeded slot (no name, title or photo), and the
 * hero swaps only from the previous seed default. Owner deletions afterwards
 * stick because the marker is recorded.
 */
export function applyIllustrativeSeed(doc: WebsiteDocument, clean: unknown) {
  const rawApplied = isObj(clean) ? (clean as { appliedSeeds?: unknown }).appliedSeeds : undefined
  const applied = Array.isArray(rawApplied) ? rawApplied.filter((s): s is string => typeof s === "string") : []
  doc.appliedSeeds = [...new Set(applied)]
  if (applied.includes(ILLUSTRATIVE_SEED)) return
  const ids = new Set(doc.media.map((m) => m.id))
  for (const m of illustrativeMedia()) if (!ids.has(m.id)) doc.media.push(m)
  // An explicit null is the owner clearing the hero and must survive; only the
  // old seed default or a genuinely absent field migrates.
  const rawHome = isObj(clean) && isObj((clean as { pages?: unknown }).pages)
    ? ((clean as { pages: Record<string, unknown> }).pages.home as unknown)
    : undefined
  const rawHero = isObj(rawHome) ? (rawHome as Record<string, unknown>).heroImageId : undefined
  const heroMissing = !isObj(rawHome) || !("heroImageId" in (rawHome as Record<string, unknown>))
  if (rawHero === "site-hero" || heroMissing) {
    doc.pages.home.heroImageId = HERO_CONCEPT_ID
  }
  for (let n = 1; n <= TEAM_SCAFFOLD_SIZE; n++) {
    const m = doc.pages.team.members.find((x) => x.id === teamSlotId(n))
    if (!m || m.photoId) continue
    const untouched = ![m.name.en, m.name.ar, m.jobTitle.en, m.jobTitle.ar, m.bio.en, m.bio.ar].some((s) => s.trim())
    if (untouched) m.photoId = illustrativePortraitId(n)
  }
  doc.appliedSeeds.push(ILLUSTRATIVE_SEED)
}

/**
 * Once-only merge of the 15 garage brand heroes. Media is appended by missing
 * id; a brand's hero is bound only when the stored brand has no hero field yet
 * (it predates this pack), so owner-chosen heroes and later deletions or
 * clearing stick once the marker is recorded.
 */
export function applyBrandHeroSeed(doc: WebsiteDocument, clean: unknown) {
  if (doc.appliedSeeds.includes(BRAND_HERO_SEED)) return
  const ids = new Set(doc.media.map((m) => m.id))
  for (const m of brandHeroMedia()) if (!ids.has(m.id)) doc.media.push(m)
  const rawBrands = isObj(clean) ? (clean as { brands?: unknown }).brands : undefined
  const rawBySlug = new Map<string, Record<string, unknown>>()
  if (Array.isArray(rawBrands)) {
    for (const b of rawBrands) if (isObj(b) && typeof (b as { slug?: unknown }).slug === "string") rawBySlug.set((b as { slug: string }).slug, b as Record<string, unknown>)
  }
  const seeded = new Set(brandHeroMedia().map((m) => m.id))
  for (const b of doc.brands) {
    const raw = rawBySlug.get(b.slug)
    // Only an absent field is seeded; an explicit value (including null or "") is the owner's choice.
    const fieldPresent = !!raw && Object.prototype.hasOwnProperty.call(raw, "heroImageId")
    if (!fieldPresent && seeded.has(brandHeroId(b.slug))) b.heroImageId = brandHeroId(b.slug)
  }
  doc.appliedSeeds.push(BRAND_HERO_SEED)
}

/** True when the media item is generated artwork rather than a real photo. */
export function isIllustrativeSource(source: MediaSource | undefined): boolean {
  return source === "ai_illustration" || source === "ai_generated"
}

export function isIllustrativeMedia(doc: WebsiteDocument, id: string | null | undefined): boolean {
  return !!id && doc.media.some((m) => m.id === id && isIllustrativeSource(m.source))
}

/** Complete (both languages), visible and not archived. Photo is optional. */
export function isPublicTeamMember(m: import("./types").TeamMember): boolean {
  return (
    m.visible &&
    !m.archived &&
    !!m.name.en.trim() &&
    !!m.name.ar.trim() &&
    !!m.jobTitle.en.trim() &&
    !!m.jobTitle.ar.trim()
  )
}

export function publicTeamMembers(doc: WebsiteDocument) {
  return doc.pages.team.members.filter(isPublicTeamMember)
}

/** The /team route and its nav links exist only when there is someone to show. */
/**
 * The Team page is public whenever its page switch is on — even with no
 * completed members it renders its intro and a contact invitation. Members
 * are gated individually by isPublicTeamMember.
 */
export function isTeamPagePublic(doc: WebsiteDocument): boolean {
  return doc.pages.team.visible
}

function isObj(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

export interface ValidationIssue {
  level: "error" | "warning"
  where: string
  message: string
}

/** Publish gate: errors block publishing; warnings are shown to the editor. */
export function validateDocument(doc: WebsiteDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const slugCheck = (list: { slug: string; name?: { en: string } ; title?: { en: string } }[], kind: string) => {
    const seen = new Set<string>()
    for (const it of list) {
      const label = it.name?.en || it.title?.en || it.slug
      if (!SLUG_RE.test(it.slug)) issues.push({ level: "error", where: `${kind}: ${label}`, message: "URL slug must be lowercase letters, numbers and hyphens." })
      if (seen.has(it.slug)) issues.push({ level: "error", where: `${kind}: ${label}`, message: `Duplicate URL slug "${it.slug}".` })
      seen.add(it.slug)
    }
  }
  slugCheck(doc.brands, "Brand")
  slugCheck(doc.services, "Service")
  slugCheck(doc.pages.custom, "Page")

  const reserved = new Set(["brands", "services", "about", "contact", "blog", "privacy", "appointment", "track", "ar", "team"])
  for (const p of doc.pages.custom) {
    if (reserved.has(p.slug)) issues.push({ level: "error", where: `Page: ${p.title.en}`, message: `"${p.slug}" is a reserved URL.` })
  }

  const mediaIds = new Set(doc.media.map((m) => m.id))
  const approved = new Set(doc.media.filter((m) => m.approval === "approved" && m.publicSafe).map((m) => m.id))
  for (const b of doc.brands.filter((x) => x.visible)) {
    if (!b.name.en.trim() || !b.name.ar.trim()) issues.push({ level: "error", where: `Brand: ${b.slug}`, message: "Name is required in English and Arabic." })
    if (!b.intro.ar.trim()) issues.push({ level: "warning", where: `Brand: ${b.name.en}`, message: "Arabic introduction is empty; the Arabic page will look incomplete." })
    for (const g of b.galleryIds) {
      if (!mediaIds.has(g)) issues.push({ level: "warning", where: `Brand: ${b.name.en}`, message: "Gallery references a deleted photo." })
      else if (!approved.has(g)) issues.push({ level: "warning", where: `Brand: ${b.name.en}`, message: "Gallery contains a photo that is not approved; it will be hidden." })
    }
    for (const c of b.caseStudies) {
      if (!c.documented) issues.push({ level: "warning", where: `Brand: ${b.name.en}`, message: `Case study "${c.title.en}" is not marked documented and will be hidden.` })
    }
    if (b.seo.title.en.length > 70) issues.push({ level: "warning", where: `Brand: ${b.name.en}`, message: "SEO title is longer than 70 characters." })
  }
  for (const s of doc.services.filter((x) => x.visible)) {
    if (!s.name.en.trim() || !s.name.ar.trim()) issues.push({ level: "error", where: `Service: ${s.slug}`, message: "Name is required in English and Arabic." })
  }
  for (const m of doc.pages.team.members) {
    if (!m.visible || m.archived) continue
    const label = m.name.en || m.name.ar || m.id
    if (!isPublicTeamMember(m)) {
      issues.push({ level: "warning", where: `Team: ${label}`, message: "Marked visible but name or job title is missing in English or Arabic; this member stays hidden." })
    }
    if (m.photoId && !approved.has(m.photoId)) {
      issues.push({ level: "warning", where: `Team: ${label}`, message: "Photo is not approved for public use; the card shows initials instead." })
    }
  }
  if (!doc.business.phone && !doc.business.whatsapp) {
    issues.push({ level: "warning", where: "Business", message: "No phone or WhatsApp number; call buttons will be hidden." })
  }
  for (const r of doc.seo.redirects) {
    if (!r.from.startsWith("/") || !r.to) issues.push({ level: "error", where: "Redirects", message: `Redirect "${r.from}" needs a path starting with / and a destination.` })
    if (r.from === r.to) issues.push({ level: "error", where: "Redirects", message: `Redirect "${r.from}" points to itself.` })
  }
  issues.push(...analyticsIssues(doc.analytics))
  return issues
}

export { SLUG_RE }
