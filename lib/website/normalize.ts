import type { WebsiteDocument } from "./types"
import { seedDocument } from "./seed"

const MAX_STR = 8000
const MAX_ITEMS = 300
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Only same-site paths or https URLs; never javascript:, data: or protocol-relative. */
export function safeUrl(v: string): string {
  const s = v.trim()
  if (!s) return ""
  if (s.startsWith("/") && !s.startsWith("//")) return s
  if (/^https:\/\/[^\s]+$/i.test(s)) return s
  if (/^tel:\+?[0-9 ]+$/.test(s) || /^mailto:[^\s]+$/.test(s)) return s
  return ""
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

/** Shape `input` like `template`: wrong types fall back to the template value. */
function shape(input: unknown, template: unknown): unknown {
  if (template === null || template === undefined) return input ?? template
  if (typeof template === "string") return typeof input === "string" ? input : template
  if (typeof template === "number") return typeof input === "number" ? input : template
  if (typeof template === "boolean") return typeof input === "boolean" ? input : template
  if (Array.isArray(template)) {
    if (!Array.isArray(input)) return template
    const itemTpl = template[0]
    return itemTpl === undefined ? input : input.map((v) => shape(v, itemTpl))
  }
  if (typeof template === "object") {
    const src = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
    const out: Record<string, unknown> = { ...src }
    for (const [k, tv] of Object.entries(template as Record<string, unknown>)) out[k] = shape(src[k], tv)
    return out
  }
  return input
}

export function normalizeDocument(input: unknown): WebsiteDocument {
  const seed = seedDocument()
  const clean = sanitize(input, "", 0)
  const doc = shape(clean, seed) as WebsiteDocument
  // Free-form legacy dictionary overrides keep their own nested shape.
  const raw = (clean && typeof clean === "object" ? (clean as Record<string, unknown>) : {}) as {
    strings?: { en?: unknown; ar?: unknown }
    images?: unknown
  }
  doc.strings = {
    en: isObj(raw.strings?.en) ? (raw.strings!.en as Record<string, unknown>) : {},
    ar: isObj(raw.strings?.ar) ? (raw.strings!.ar as Record<string, unknown>) : {},
  }
  doc.images = {}
  if (isObj(raw.images)) {
    for (const [k, v] of Object.entries(raw.images as Record<string, unknown>)) {
      const u = typeof v === "string" ? safeUrl(v) : ""
      if (u) doc.images[k] = u
    }
  }
  doc.schemaVersion = 1
  return doc
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

  const reserved = new Set(["brands", "services", "about", "contact", "blog", "privacy", "appointment", "track", "ar"])
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
  if (!doc.business.phone && !doc.business.whatsapp) {
    issues.push({ level: "warning", where: "Business", message: "No phone or WhatsApp number; call buttons will be hidden." })
  }
  for (const r of doc.seo.redirects) {
    if (!r.from.startsWith("/") || !r.to) issues.push({ level: "error", where: "Redirects", message: `Redirect "${r.from}" needs a path starting with / and a destination.` })
    if (r.from === r.to) issues.push({ level: "error", where: "Redirects", message: `Redirect "${r.from}" points to itself.` })
  }
  return issues
}

export { SLUG_RE }
