import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { localePath, pick, siteContext, SITE_URL } from "@/lib/website/render"
import { displayImageAlt, displayImageCaption } from "@/lib/website/media-display"
import { isIndexableDeployment } from "@/lib/website/env"
import { getPublishedArticle, listLiveArticles } from "@/lib/blog"
import { businessId, jsonLdString, websiteId } from "@/lib/website/structured-data"
import { isLocaleLive, liveLocales, relatedArticles, type Article, type ArticleLang } from "@/lib/article-model"
import { withSuffix } from "@/lib/safe-markdown"
import { ArticleBody } from "@/components/site/article-body"
import { ArticleCard, articleHref, formatArticleDate } from "@/components/site/article-card"

export const dynamic = "force-dynamic"

const UI = {
  en: {
    back: "All articles",
    published: "Published",
    updated: "Updated",
    reviewed: "Reviewed by",
    sources: "Sources",
    checked: "checked",
    services: "Related services",
    related: "Keep reading",
    brandPage: (n: string) => `${n} at SHWURX`,
    cta: (n: string) => (n ? `Ask about your ${n}` : "Send an enquiry"),
    ctaLead: "Tell us the model, year and what you are seeing. We reply with next steps before any work starts.",
  },
  ar: {
    back: "كل المقالات",
    published: "نُشر",
    updated: "حُدّث",
    reviewed: "راجعه",
    sources: "المصادر",
    checked: "تم التحقق",
    services: "خدمات ذات صلة",
    related: "تابع القراءة",
    brandPage: (n: string) => `${n} في SHWURX`,
    cta: (n: string) => (n ? `استفسر عن ${n}` : "أرسل استفساراً"),
    ctaLead: "أخبرنا بالموديل والسنة وما تلاحظه، وسنرد بالخطوات التالية قبل البدء بأي عمل.",
  },
}

async function load(slug: string) {
  const [ctx, article] = await Promise.all([siteContext(), getPublishedArticle(slug)])
  return { ...ctx, article: article && isLocaleLive(article, ctx.lang) ? article : null }
}

const abs = (lang: ArticleLang, slug: string) => `${SITE_URL}${articleHref(slug, lang)}`

/** hreflang lists only locales that are actually live, so no alternate points at a 404. */
function alternates(a: Article, lang: ArticleLang) {
  const live = liveLocales(a)
  const languages: Record<string, string> = {}
  for (const l of live) languages[l] = abs(l, a.slug)
  languages["x-default"] = abs(live.includes("en") ? "en" : live[0], a.slug)
  return { canonical: abs(lang, a.slug), languages }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { doc, lang, preview, article } = await load(slug)
  if (!article) return { robots: { index: false, follow: false } }
  const c = article.content[lang]
  const title = withSuffix(c.seoTitle || c.title, pick(doc.seo.titleSuffix, lang))
  const description = c.seoDescription || c.excerpt
  const image = article.coverUrl ? (article.coverUrl.startsWith("/") ? `${SITE_URL}${article.coverUrl}` : article.coverUrl) : undefined
  return {
    title: { absolute: title },
    description,
    alternates: alternates(article, lang),
    openGraph: {
      type: "article",
      title,
      description,
      url: abs(lang, article.slug),
      siteName: pick(doc.seo.siteName, lang),
      locale: lang === "ar" ? "ar_AE" : "en_AE",
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt || undefined,
      images: image ? [{ url: image, alt: displayImageAlt(c.coverAlt, c.title, article.coverIllustrative) }] : undefined,
    },
    robots: !isIndexableDeployment() || preview ? { index: false, follow: false, nocache: true } : undefined,
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { doc, lang, article } = await load(slug)
  if (!article) notFound()
  const u = UI[lang]
  const c = article.content[lang]
  const coverCaption = displayImageCaption(c.coverCaption, article.coverIllustrative)

  const brand = article.brandSlug ? doc.brands.find((b) => b.slug === article.brandSlug && b.visible) : undefined
  const brandName = brand ? pick(brand.name, lang) : ""
  const services = article.serviceSlugs
    .map((s) => doc.services.find((x) => x.slug === s && x.visible))
    .filter((s): s is NonNullable<typeof s> => !!s)
  const liveArticles = await listLiveArticles(lang)
  const related = relatedArticles(article, liveArticles, lang)
  const publishedArticleHrefs = liveArticles.map((a) => articleHref(a.slug, lang))
  const relatedBrand = (s: string | null) => (s ? pick(doc.brands.find((b) => b.slug === s)?.name, lang) : "")
  const enquireHref = brand ? `${localePath(lang, `/brands/${brand.slug}`)}#enquire` : localePath(lang, "/contact")
  const updatedDiffers = article.updatedAt && article.publishedAt && article.updatedAt.slice(0, 10) !== article.publishedAt.slice(0, 10)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: c.title,
    description: c.seoDescription || c.excerpt,
    inLanguage: lang === "ar" ? "ar-AE" : "en-AE",
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt || undefined,
    mainEntityOfPage: abs(lang, article.slug),
    image: article.coverUrl ? (article.coverUrl.startsWith("/") ? `${SITE_URL}${article.coverUrl}` : article.coverUrl) : undefined,
    publisher: { "@id": businessId(SITE_URL) },
    isPartOf: { "@id": websiteId(SITE_URL) },
    about: brand ? { "@type": "Brand", name: brand.name.en } : undefined,
    citation: article.sources.map((s) => s.url),
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 lg:px-8 lg:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={localePath(lang, "/blog")} className="font-semibold text-primary hover:underline">
          {u.back}
        </Link>
        {brand && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">/</span>
            <Link href={localePath(lang, `/brands/${brand.slug}`)} className="text-muted-foreground hover:text-foreground hover:underline">
              {brandName}
            </Link>
          </>
        )}
      </nav>

      <header className="mt-6">
        <h1 className="text-balance text-3xl font-bold tracking-tight lg:text-4xl">{c.title}</h1>
        {c.excerpt && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{c.excerpt}</p>}
        <p className="mt-5 text-sm text-muted-foreground">
          {u.published} <time dateTime={article.publishedAt ?? undefined}>{formatArticleDate(article.publishedAt, lang)}</time>
          {updatedDiffers && (
            <>
              {" · "}
              {u.updated} <time dateTime={article.updatedAt}>{formatArticleDate(article.updatedAt, lang)}</time>
            </>
          )}
          {article.reviewedBy && ` · ${u.reviewed} ${article.reviewedBy}`}
        </p>
      </header>

      {article.coverUrl && (
        <figure className="mt-8">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted">
            <Image src={article.coverUrl || "/placeholder.svg"} alt={displayImageAlt(c.coverAlt, c.title, article.coverIllustrative)} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" priority />
          </div>
          {coverCaption && <figcaption className="mt-2 text-sm text-muted-foreground">{coverCaption}</figcaption>}
        </figure>
      )}

      <ArticleBody body={c.body} publishedArticleHrefs={publishedArticleHrefs} siteUrl={SITE_URL} />

      <aside className="mt-12 rounded-2xl border border-border bg-card p-6" aria-labelledby="article-cta">
        <h2 id="article-cta" className="text-xl font-semibold">
          {c.ctaLabel || u.cta(brandName)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{u.ctaLead}</p>
        <Link
          href={enquireHref}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {c.ctaLabel || u.cta(brandName)} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
        {brand && (
          <Link href={localePath(lang, `/brands/${brand.slug}`)} className="ms-4 text-sm font-medium text-primary hover:underline">
            {u.brandPage(brandName)}
          </Link>
        )}
      </aside>

      {services.length > 0 && (
        <section className="mt-12" aria-labelledby="article-services">
          <h2 id="article-services" className="text-lg font-semibold">{u.services}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={localePath(lang, `/services/${s.slug}`)} className="inline-flex rounded-full border border-border px-4 py-2 text-sm hover:border-primary/60">
                  {pick(s.name, lang)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {article.sources.length > 0 && (
        <section className="mt-12" aria-labelledby="article-sources">
          <h2 id="article-sources" className="text-lg font-semibold">{u.sources}</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-sm leading-relaxed text-muted-foreground">
            {article.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline" dir="ltr">
                  {s.title || s.url}
                </a>
                {s.verifiedOn && <span> · {u.checked} {s.verifiedOn}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-14" aria-labelledby="article-related">
          <h2 id="article-related" className="text-lg font-semibold">{u.related}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.id}>
                <ArticleCard article={r} lang={lang} brandName={relatedBrand(r.brandSlug)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
