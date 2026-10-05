import {
  articleToRow,
  emptyCopy,
  localeIssues,
  liveLocales,
  rowToArticle,
  type Article,
  type ArticleLang,
  type LocaleCopy,
} from "@/lib/article-model"

export const PUBLIC_AUTHOR = "SHWURX Auto Service Center"

/** Private draft document stored in `article_drafts.doc`. Status is derived from `published_revision`. */
export function articleToDoc(a: Article): Record<string, unknown> {
  const { status: _status, ...doc } = articleToRow(a)
  return { ...doc, author: a.author }
}

export interface DraftRow {
  id: string
  article_key: string
  slug: string
  brand_slug: string | null
  workflow: string
  doc: Record<string, unknown>
  revision: number
  published_revision: number | null
  first_published_at: string | null
  updated_at: string
}

export type DraftArticle = Article & {
  /** The draft has saved changes that are not on the live site yet. */
  draftAhead: boolean
}

export function draftRowToArticle(row: DraftRow): DraftArticle {
  const doc = row.doc && typeof row.doc === "object" ? row.doc : {}
  const live = row.published_revision != null
  const a = rowToArticle({
    ...doc,
    id: row.id,
    article_key: row.article_key,
    slug: row.slug,
    brand_slug: row.brand_slug,
    workflow: row.workflow,
    revision: row.revision,
    status: live ? "published" : "draft",
    published_at: row.first_published_at,
    updated_at: row.updated_at,
  })
  // Draft docs are always bilingual; never treat a missing locale as a legacy post.
  return { ...a, legacy: false, draftAhead: live && row.published_revision !== row.revision }
}

/** Keep editable copy separate from what visitors can currently read. */
export function withPublishedSnapshot(draft: DraftArticle, live: Article | null): DraftArticle {
  return {
    ...draft,
    published: live?.status === "published" ? {
      slug: live.slug,
      brandSlug: live.brandSlug,
      title: { en: live.content.en.title, ar: live.content.ar.title },
      excerpt: { en: live.content.en.excerpt, ar: live.content.ar.excerpt },
      coverUrl: live.coverUrl,
      locales: liveLocales(live),
      publishedAt: live.publishedAt,
      revision: live.revision,
    } : null,
  }
}

/**
 * The row written to `blog_posts` on publish. Only locales that pass every
 * readiness rule are copied; briefs, reviewer identity and non-https sources
 * never leave the private draft.
 */
export function publicSnapshot(a: Article): Record<string, unknown> {
  const pick = (l: ArticleLang): LocaleCopy => (localeIssues(a.content[l]).length === 0 ? a.content[l] : emptyCopy())
  const content = { en: pick("en"), ar: pick("ar") }
  const lead = content.en.title ? content.en : content.ar
  return {
    article_key: a.key,
    slug: a.slug,
    title: lead.title || a.slug,
    excerpt: lead.excerpt || null,
    body: lead.body,
    content,
    brand_slug: a.brandSlug,
    service_slugs: a.serviceSlugs,
    related_keys: a.relatedKeys,
    sources: a.sources.filter((s) => /^https:\/\//.test(s.url)),
    cover_url: a.coverUrl,
    cover_illustrative: a.coverIllustrative,
    reviewed_by: null,
    reviewed_at: null,
    author: PUBLIC_AUTHOR,
  }
}

const FILLABLE: (keyof LocaleCopy)[] = ["title", "excerpt", "body", "seoTitle", "seoDescription", "coverAlt", "coverCaption", "ctaLabel"]

/**
 * Import merge that only fills what is missing. Anything an editor already set
 * (copy, SEO, taxonomy, sources, slug, cover, readiness) is kept as-is.
 */
export function fillMissing(base: Article, incoming: Article): { next: Article; changed: boolean } {
  let changed = false
  const fill = <T>(current: T, value: T, empty: boolean): T => {
    if (!empty) return current
    if (JSON.stringify(current) !== JSON.stringify(value)) changed = true
    return value
  }

  const copy = (l: ArticleLang): LocaleCopy => {
    const out = { ...base.content[l] }
    const coverOwned = !!base.coverUrl
    for (const f of FILLABLE) {
      if (f === "ready") continue
      if ((f === "coverAlt" || f === "coverCaption") && coverOwned) continue
      const cur = out[f] as string
      out[f] = fill(cur, incoming.content[l][f] as string, !cur.trim()) as never
    }
    return out
  }

  const next: Article = {
    ...base,
    brandSlug: fill(base.brandSlug, incoming.brandSlug, !base.brandSlug),
    serviceSlugs: fill(base.serviceSlugs, incoming.serviceSlugs, base.serviceSlugs.length === 0),
    relatedKeys: fill(base.relatedKeys, incoming.relatedKeys, base.relatedKeys.length === 0),
    sources: fill(base.sources, incoming.sources, base.sources.length === 0),
    coverUrl: fill(base.coverUrl, incoming.coverUrl, !base.coverUrl),
    coverIllustrative: base.coverUrl ? base.coverIllustrative : incoming.coverIllustrative,
    content: { en: copy("en"), ar: copy("ar") },
  }

  if (changed) {
    // New copy needs a person to review it; approval never carries over imported text.
    if (base.workflow === "brief" || base.workflow === "approved") next.workflow = "in_review"
    if (base.workflow === "approved") {
      next.reviewedBy = null
      next.reviewedAt = null
    }
  }
  return { next, changed }
}
