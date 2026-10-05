import Link from "next/link"
import Image from "next/image"
import { displayImageAlt } from "@/lib/website/media-display"
import type { Article, ArticleLang } from "@/lib/article-model"

export function formatArticleDate(iso: string | null, lang: ArticleLang) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "long", year: "numeric" })
}

export function articleHref(slug: string, lang: ArticleLang) {
  return lang === "ar" ? `/ar/blog/${slug}` : `/blog/${slug}`
}

export function ArticleCard({ article, lang, brandName }: { article: Article; lang: ArticleLang; brandName?: string }) {
  const c = article.content[lang]
  return (
    <Link
      href={articleHref(article.slug, lang)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/60"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {article.coverUrl ? (
          <Image
            src={article.coverUrl || "/placeholder.svg"}
            alt={displayImageAlt(c.coverAlt, c.title, article.coverIllustrative)}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-black text-muted-foreground/40" aria-hidden="true">
            SHWUR<span className="text-primary/50">X</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {brandName ? <span className="text-primary">{brandName}</span> : null}
          {brandName && article.publishedAt ? " · " : null}
          {formatArticleDate(article.publishedAt, lang)}
        </p>
        <h2 className="text-pretty text-lg font-semibold leading-snug text-foreground">{c.title}</h2>
        {c.excerpt && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{c.excerpt}</p>}
      </div>
    </Link>
  )
}
