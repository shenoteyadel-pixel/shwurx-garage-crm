/**
 * Bilingual article model shared by the editor, public pages, sitemap,
 * importer and tests. Pure (no server imports) so it is unit-testable.
 *
 * Storage: one `blog_posts` row per article. Locale copy lives in
 * `content.{en,ar}`; legacy rows (content = {}) fall back to the scalar
 * title/excerpt/body columns as English-only, never as Arabic.
 */

export type ArticleLang = "en" | "ar"
export type ArticleStatus = "draft" | "published"
export type ArticleWorkflow = "brief" | "draft" | "in_review" | "approved"

export const WORKFLOWS: ArticleWorkflow[] = ["brief", "draft", "in_review", "approved"]
export const MIN_BODY_CHARS = 600
export const PAGE_SIZE = 9

export interface LocaleCopy {
  title: string
  excerpt: string
  body: string
  seoTitle: string
  seoDescription: string
  coverAlt: string
  coverCaption: string
  ctaLabel: string
  /** Owner marks a locale ready once it has been written and checked. */
  ready: boolean
}

export interface ArticleSource {
  title: string
  url: string
  supports: string
  verifiedOn: string
}

export interface ArticleBrief {
  searchIntent: { en: string; ar: string }
  modelScope: string
  outline: { en: string; ar: string }[]
  photoBrief: string
  factualCaution: string
}

/** Live metadata for the private editor, read from the actual public snapshot. */
export interface PublishedArticleSummary {
  slug: string
  brandSlug: string | null
  title: Record<ArticleLang, string>
  excerpt: Record<ArticleLang, string>
  coverUrl: string | null
  locales: ArticleLang[]
  publishedAt: string | null
  revision: number
}

export interface Article {
  id: string
  key: string | null
  slug: string
  status: ArticleStatus
  workflow: ArticleWorkflow
  brandSlug: string | null
  serviceSlugs: string[]
  relatedKeys: string[]
  coverUrl: string | null
  coverIllustrative: boolean
  content: Record<ArticleLang, LocaleCopy>
  sources: ArticleSource[]
  brief: ArticleBrief | null
  reviewedBy: string | null
  reviewedAt: string | null
  author: string | null
  publishedAt: string | null
  updatedAt: string
  revision: number
  /** True when the row predates the bilingual model (content = {}). */
  legacy: boolean
  /** Private editor metadata; never serialized into a draft document or public snapshot. */
  draftAhead?: boolean
  published?: PublishedArticleSummary | null
}

export const emptyCopy = (): LocaleCopy => ({
  title: "",
  excerpt: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
  coverAlt: "",
  coverCaption: "",
  ctaLabel: "",
  ready: false,
})

const str = (v: unknown): string => (typeof v === "string" ? v : "")
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

function copyFrom(raw: unknown): LocaleCopy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    title: str(r.title),
    excerpt: str(r.excerpt),
    body: str(r.body),
    seoTitle: str(r.seoTitle),
    seoDescription: str(r.seoDescription),
    coverAlt: str(r.coverAlt),
    coverCaption: str(r.coverCaption),
    ctaLabel: str(r.ctaLabel),
    ready: r.ready === true,
  }
}

function sourcesFrom(raw: unknown): ArticleSource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => {
      const r = (s ?? {}) as Record<string, unknown>
      return { title: str(r.title), url: str(r.url), supports: str(r.supports), verifiedOn: str(r.verifiedOn ?? r.verified_on) }
    })
    .filter((s) => s.title || s.url)
}

function briefFrom(raw: unknown): ArticleBrief | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const pair = (v: unknown) => {
    const p = (v ?? {}) as Record<string, unknown>
    return { en: str(p.en), ar: str(p.ar) }
  }
  return {
    searchIntent: pair(r.searchIntent),
    modelScope: str(r.modelScope),
    outline: Array.isArray(r.outline) ? r.outline.map(pair) : [],
    photoBrief: str(r.photoBrief),
    factualCaution: str(r.factualCaution),
  }
}

/** Normalizes any `blog_posts` row — bilingual or legacy scalar — into an Article. */
export function rowToArticle(row: Record<string, unknown>): Article {
  const content = (row.content && typeof row.content === "object" ? row.content : {}) as Record<string, unknown>
  const legacy = !content.en && !content.ar
  const en = legacy
    ? {
        ...emptyCopy(),
        title: str(row.title),
        excerpt: str(row.excerpt),
        body: str(row.body),
        // A legacy post that was already live stays readable in English.
        ready: row.status === "published",
      }
    : copyFrom(content.en)
  const workflow = WORKFLOWS.includes(row.workflow as ArticleWorkflow)
    ? (row.workflow as ArticleWorkflow)
    : legacy && row.status === "published"
      ? "approved"
      : "draft"
  return {
    id: str(row.id),
    key: str(row.article_key) || null,
    slug: str(row.slug),
    status: row.status === "published" ? "published" : "draft",
    workflow,
    brandSlug: str(row.brand_slug) || null,
    serviceSlugs: strArr(row.service_slugs),
    relatedKeys: strArr(row.related_keys),
    coverUrl: str(row.cover_url) || null,
    coverIllustrative: row.cover_illustrative === true,
    content: { en, ar: legacy ? emptyCopy() : copyFrom(content.ar) },
    sources: sourcesFrom(row.sources),
    brief: briefFrom(row.brief),
    reviewedBy: str(row.reviewed_by) || null,
    reviewedAt: str(row.reviewed_at) || null,
    author: str(row.author) || null,
    publishedAt: str(row.published_at) || null,
    updatedAt: str(row.updated_at),
    revision: typeof row.revision === "number" ? row.revision : 1,
    legacy,
  }
}

/** Reasons a locale cannot go live. Empty array = publishable. */
export function localeIssues(c: LocaleCopy, requireSeo = true): string[] {
  const issues: string[] = []
  if (!c.title.trim()) issues.push("title")
  if (!c.excerpt.trim()) issues.push("excerpt")
  if (c.body.trim().length < MIN_BODY_CHARS) issues.push(`body (min ${MIN_BODY_CHARS} characters)`)
  if (requireSeo && !c.seoDescription.trim()) issues.push("SEO description")
  if (!c.ready) issues.push("not marked ready")
  return issues
}

export function isLocaleLive(a: Article, lang: ArticleLang): boolean {
  if (a.status !== "published") return false
  // Legacy English posts predate SEO fields; they stay readable but are held to title/body.
  if (a.legacy) return lang === "en" && !!a.content.en.title.trim() && !!a.content.en.body.trim()
  return localeIssues(a.content[lang]).length === 0
}

export function liveLocales(a: Article): ArticleLang[] {
  return (["en", "ar"] as const).filter((l) => isLocaleLive(a, l))
}

/** Every rule that must hold before `status = published` is accepted. */
export function publishIssues(a: Article): string[] {
  const issues: string[] = []
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) issues.push("Slug must be lowercase ASCII words separated by hyphens.")
  if (a.workflow !== "approved") issues.push("Workflow must be Approved (reviewed) before publishing.")
  if (!a.reviewedBy || !a.reviewedAt) issues.push("Record who reviewed the article and when.")
  const en = localeIssues(a.content.en)
  const ar = localeIssues(a.content.ar)
  if (en.length && ar.length) issues.push(`At least one complete locale is required. English: ${en.join(", ")}. Arabic: ${ar.join(", ")}.`)
  if (a.brandSlug && a.sources.length === 0) issues.push("Brand articles need at least one cited source.")
  for (const s of a.sources) if (!/^https:\/\//.test(s.url)) issues.push(`Source "${s.title || s.url}" needs an https URL.`)
  if (a.coverUrl) {
    for (const l of ["en", "ar"] as const) {
      if (localeIssues(a.content[l]).length === 0 && !a.content[l].coverAlt.trim()) issues.push(`Cover image needs ${l.toUpperCase()} alt text.`)
      if (a.coverIllustrative && localeIssues(a.content[l]).length === 0 && !a.content[l].coverCaption.trim())
        issues.push(`Illustrative cover needs a ${l.toUpperCase()} caption saying it is illustrative.`)
    }
  }
  return issues
}

/** Columns written on save. Scalar columns mirror English so legacy readers keep working. */
export function articleToRow(a: Article): Record<string, unknown> {
  const fallback = a.content.en.title ? a.content.en : a.content.ar
  return {
    article_key: a.key,
    slug: a.slug,
    status: a.status,
    workflow: a.workflow,
    brand_slug: a.brandSlug,
    service_slugs: a.serviceSlugs,
    related_keys: a.relatedKeys,
    cover_url: a.coverUrl,
    cover_illustrative: a.coverIllustrative,
    content: { en: a.content.en, ar: a.content.ar },
    sources: a.sources,
    brief: a.brief,
    reviewed_by: a.reviewedBy,
    reviewed_at: a.reviewedAt,
    title: fallback.title || a.slug,
    excerpt: fallback.excerpt || null,
    body: fallback.body,
  }
}

export interface ArticleFilters {
  brand?: string
  service?: string
  q?: string
  /** Model name (e.g. "Continental GT / GTC"); ranks matching articles first, never hides brand-wide ones. */
  model?: string
  page?: number
}

/** "Continental GT / GTC" -> ["continental gt", "gtc"]; drops fragments too short to match safely. */
function modelTerms(model: string): string[] {
  return model
    .split("/")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)
}

export function articleMatchesModel(a: Article, lang: ArticleLang, model: string): boolean {
  const terms = modelTerms(model)
  if (terms.length === 0) return false
  const c = a.content[lang]
  const hay = `${c.title} ${c.excerpt} ${c.body} ${a.brief?.modelScope ?? ""}`.toLowerCase()
  return terms.some((t) => hay.includes(t))
}

/** Filter/search/paginate articles that are live in `lang`. */
export function queryArticles(all: Article[], lang: ArticleLang, f: ArticleFilters) {
  const q = (f.q ?? "").trim().toLowerCase()
  const matches = all
    .filter((a) => isLocaleLive(a, lang))
    .filter((a) => !f.brand || a.brandSlug === f.brand)
    .filter((a) => !f.service || a.serviceSlugs.includes(f.service))
    .filter((a) => {
      if (!q) return true
      const c = a.content[lang]
      return `${c.title} ${c.excerpt} ${c.body}`.toLowerCase().includes(q)
    })
    .sort((x, y) => (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""))
  const model = f.model?.trim()
  const modelIds = new Set(model ? matches.filter((a) => articleMatchesModel(a, lang, model)).map((a) => a.id) : [])
  if (modelIds.size > 0) matches.sort((x, y) => Number(modelIds.has(y.id)) - Number(modelIds.has(x.id)))
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1)), pages)
  return {
    total: matches.length,
    modelMatches: modelIds.size,
    modelIds,
    page,
    pages,
    items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  }
}

/** Related live articles: explicit keys first, then same brand, then shared service. */
export function relatedArticles(a: Article, all: Article[], lang: ArticleLang, limit = 3): Article[] {
  const pool = all.filter((x) => x.id !== a.id && isLocaleLive(x, lang))
  const ranked = [
    ...pool.filter((x) => x.key && a.relatedKeys.includes(x.key)),
    ...pool.filter((x) => a.brandSlug && x.brandSlug === a.brandSlug),
    ...pool.filter((x) => x.serviceSlugs.some((s) => a.serviceSlugs.includes(s))),
  ]
  return [...new Map(ranked.map((x) => [x.id, x])).values()].slice(0, limit)
}

/* ------------------------------ Matrix import ------------------------------ */

interface MatrixArticle {
  id: string
  brand_slug: string
  slug: string
  title: { en: string; ar: string }
  search_intent?: { en: string; ar: string }
  model_scope?: string
  outline?: { en: string; ar: string }[]
  internal_links?: { services?: { slug: string }[] }
  sources?: { title: string; url: string; supports?: string; verified_on?: string }[]
  photo_brief?: string
  factual_caution?: string
}

/**
 * Maps an editorial brief to a brief-stage draft row. Only titles are set as
 * copy — bodies stay empty so nothing can publish until an editor writes them.
 */
export function briefToRow(m: MatrixArticle, siblings: string[]): Record<string, unknown> {
  const a: Article = {
    id: "",
    key: m.id,
    slug: m.slug,
    status: "draft",
    workflow: "brief",
    brandSlug: m.brand_slug,
    serviceSlugs: (m.internal_links?.services ?? []).map((s) => s.slug),
    relatedKeys: siblings.filter((k) => k !== m.id),
    coverUrl: null,
    coverIllustrative: false,
    content: { en: { ...emptyCopy(), title: m.title.en }, ar: { ...emptyCopy(), title: m.title.ar } },
    sources: sourcesFrom(m.sources),
    brief: {
      searchIntent: m.search_intent ?? { en: "", ar: "" },
      modelScope: m.model_scope ?? "",
      outline: m.outline ?? [],
      photoBrief: m.photo_brief ?? "",
      factualCaution: m.factual_caution ?? "",
    },
    reviewedBy: null,
    reviewedAt: null,
    author: null,
    publishedAt: null,
    updatedAt: "",
    revision: 1,
    legacy: false,
  }
  return articleToRow(a)
}

export function matrixToRows(articles: MatrixArticle[]): Record<string, unknown>[] {
  const byBrand = new Map<string, string[]>()
  for (const m of articles) byBrand.set(m.brand_slug, [...(byBrand.get(m.brand_slug) ?? []), m.id])
  return articles.map((m) => briefToRow(m, byBrand.get(m.brand_slug) ?? []))
}

/* ---------------------------- Editorial bodies ----------------------------- */

type Bi = { en: string; ar: string }

export interface EditorialArticle {
  id: string
  slug: string
  brandSlug: string
  title: Bi
  excerpt: Bi
  seoTitle: Bi
  seoDescription: Bi
  body: Bi
  serviceSlugs: string[]
  relatedArticleSlugs: string[]
  sources: { title: string; url: string; note?: string }[]
  reviewedAt?: string
}

export interface DefaultCover {
  url: string
  alt: Bi
  caption: Bi
}

/**
 * Full bilingual copy from the editorial package. Lands in review (never
 * published, `ready` unchecked) so a person signs off on both locales first.
 * The brand's garage hero is used as an illustrative default cover.
 */
export function editorialToArticle(
  e: EditorialArticle,
  slugToKey: Map<string, string>,
  cover: DefaultCover | null,
  base: Article | null,
): Article {
  const copy = (l: ArticleLang): LocaleCopy => ({
    ...(base?.content[l] ?? emptyCopy()),
    title: e.title[l],
    excerpt: e.excerpt[l],
    body: e.body[l],
    seoTitle: e.seoTitle[l],
    seoDescription: e.seoDescription[l],
    coverAlt: base?.coverUrl ? base.content[l].coverAlt : (cover?.alt[l] ?? ""),
    coverCaption: base?.coverUrl ? base.content[l].coverCaption : (cover?.caption[l] ?? ""),
    ready: false,
  })
  const keepCover = !!base?.coverUrl
  return {
    id: base?.id ?? "",
    key: e.id,
    slug: e.slug,
    status: "draft",
    workflow: "in_review",
    brandSlug: e.brandSlug,
    serviceSlugs: e.serviceSlugs,
    relatedKeys: e.relatedArticleSlugs.map((s) => slugToKey.get(s)).filter((k): k is string => !!k),
    coverUrl: keepCover ? base!.coverUrl : (cover?.url ?? null),
    coverIllustrative: keepCover ? base!.coverIllustrative : !!cover,
    content: { en: copy("en"), ar: copy("ar") },
    sources: e.sources
      .filter((s) => /^https:\/\//.test(s.url))
      .map((s) => ({ title: s.title, url: s.url, supports: s.note ?? "", verifiedOn: e.reviewedAt ?? "" })),
    brief: base?.brief ?? null,
    reviewedBy: null,
    reviewedAt: null,
    author: base?.author ?? null,
    publishedAt: null,
    updatedAt: "",
    revision: base?.revision ?? 1,
    legacy: false,
  }
}

/** True when an existing row is still an untouched brief (no body copy in either locale). */
export function isEmptyBrief(a: Article): boolean {
  return a.workflow === "brief" && !a.content.en.body.trim() && !a.content.ar.body.trim()
}

/** Paragraph/heading blocks from plain-text bodies: blank line = paragraph, "## " = heading. */
export function bodyBlocks(body: string): { type: "h2" | "p"; text: string }[] {
  return body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => (b.startsWith("## ") ? { type: "h2" as const, text: b.slice(3).trim() } : { type: "p" as const, text: b }))
}
