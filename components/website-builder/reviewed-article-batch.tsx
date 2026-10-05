"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Card } from "@/components/ui"
import { publishReviewedArticleBrand } from "@/lib/actions-articles"
import { REVIEWED_ARTICLE_BRANDS, isCurrentBilingualPublication, type ArticleBatchResult } from "@/lib/article-batch"
import type { Article } from "@/lib/article-model"
import type { ArticleTaxonomy } from "@/lib/website/control-center-data"

const OUTCOME = { published: "Published", already_live: "Already live", edited: "Skipped — edited", missing: "Skipped — missing", conflict: "Conflict", failed: "Failed / verify current state" }

export function ReviewedArticleBatch({ posts, taxonomy }: { posts: Article[]; taxonomy: ArticleTaxonomy }) {
  const router = useRouter()
  const [brand, setBrand] = useState<string>(REVIEWED_ARTICLE_BRANDS[0])
  const [result, setResult] = useState<ArticleBatchResult | null>(null)
  const [pending, start] = useTransition()
  const keys = Array.from({ length: 5 }, (_, i) => `${brand}-${String(i + 1).padStart(2, "0")}`)
  const rows = keys.map((key) => ({ key, article: posts.find((p) => p.key === key) }))
  const live = rows.filter(({ article }) => article && isCurrentBilingualPublication(article)).length

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">Publish reviewed articles by brand</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Five bilingual articles at a time. This records your review of both languages and publishes only saved articles
          that exactly match the reviewed editorial package. Edited or missing articles are kept unchanged and listed below.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Reviewed article brand" value={brand} disabled={pending}
          onChange={(e) => { setBrand(e.target.value); setResult(null) }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {REVIEWED_ARTICLE_BRANDS.map((slug) => <option key={slug} value={slug}>{taxonomy.brands.find((b) => b.slug === slug)?.name ?? slug}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Current library: {live}/5 live in both languages with no pending revision</span>
      </div>
      <ul className="space-y-2 text-xs">
        {rows.map(({ key, article }) => {
          const outcome = result?.items.find((item) => item.key === key)
          return <li key={key} className="rounded-md border border-border p-2">
            <p className="font-medium">{article?.content.en.title || key}</p>
            {article?.content.ar.title && <p dir="rtl" lang="ar" className="mt-1">{article.content.ar.title}</p>}
            <p className="mt-1 text-muted-foreground">{article ? `Saved revision ${article.revision} · ${isCurrentBilingualPublication(article) ? "Live EN + AR" : "Not live at this revision in both languages"}` : "Not imported"}</p>
            {outcome && <p role="status" className="mt-1">{OUTCOME[outcome.outcome]}: {outcome.message}</p>}
          </li>
        })}
      </ul>
      {result?.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
      <Button type="button" disabled={pending} onClick={() => start(async () => {
        setResult(null)
        try {
          setResult(await publishReviewedArticleBrand(brand, rows.flatMap(({ key, article }) => article ? [{ key, id: article.id, revision: article.revision }] : [])))
        } catch {
          setResult({ ok: false, items: [], error: "Could not verify the batch. Refresh the library before retrying." })
        } finally {
          router.refresh()
        }
      })}>
        {pending ? "Reviewing and publishing five articles…" : "Review both languages and publish reviewed package"}
      </Button>
      <p className="text-xs text-muted-foreground">Counts come from saved library data after refresh. Already published matching revisions are skipped safely.</p>
    </Card>
  )
}
