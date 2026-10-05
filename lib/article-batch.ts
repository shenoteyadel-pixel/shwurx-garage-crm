import type { Article } from "@/lib/article-model"

export const REVIEWED_ARTICLE_BRANDS = [
  "porsche", "bentley", "rolls-royce", "lamborghini", "mercedes-benz", "audi", "lotus", "mclaren",
  "aston-martin", "ferrari", "maserati", "bugatti", "chevrolet-corvette", "gmc", "range-rover",
] as const

export type ArticleBatchVersion = { key: string; id: string; revision: number }
export type ArticleBatchItemResult = {
  key: string
  outcome: "published" | "already_live" | "edited" | "missing" | "conflict" | "failed"
  message: string
  revision?: number
}
export type ArticleBatchResult = { ok: boolean; items: ArticleBatchItemResult[]; error?: string }

/** Canonical object keys survive JSONB round trips; array order and every reviewed value remain exact. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  }
  return value
}

/** Approval metadata/lifecycle are separate from reviewed copy; only locale readiness is omitted from copy. */
export function reviewedPackageFingerprint(a: Article): string {
  const copy = (lang: "en" | "ar") => {
    const { ready: _ready, ...reviewed } = a.content[lang]
    return reviewed
  }
  return JSON.stringify(canonical({
    key: a.key, slug: a.slug, content: { en: copy("en"), ar: copy("ar") }, sources: a.sources,
    brandSlug: a.brandSlug, serviceSlugs: a.serviceSlugs, relatedKeys: a.relatedKeys,
    coverUrl: a.coverUrl, coverIllustrative: a.coverIllustrative,
  }))
}

export function isCurrentBilingualPublication(a: Article): boolean {
  return a.status === "published" && a.draftAhead === false && a.published?.revision === a.revision
    && a.published.slug === a.slug && a.published.locales.includes("en") && a.published.locales.includes("ar")
}
