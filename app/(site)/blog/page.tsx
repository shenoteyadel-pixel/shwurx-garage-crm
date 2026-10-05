import type { Metadata } from "next"
import Link from "next/link"
import { buildMetadata, localePath, pick, siteContext } from "@/lib/website/render"
import { listLiveArticles } from "@/lib/blog"
import { queryArticles, type ArticleFilters } from "@/lib/article-model"
import { ArticleCard } from "@/components/site/article-card"

export const dynamic = "force-dynamic"

const UI = {
  en: {
    title: "Workshop notes",
    intro: "Brand-specific maintenance and repair guidance from the SHWURX workshop in Dubai, checked against manufacturer sources.",
    search: "Search articles",
    brand: "Brand",
    service: "Service",
    allBrands: "All brands",
    allServices: "All services",
    apply: "Filter",
    clear: "Clear",
    results: (n: number) => (n === 1 ? "1 article" : `${n} articles`),
    empty: "No articles match yet. Try another brand or clear the filters.",
    none: "No articles are published yet.",
    prev: "Previous",
    next: "Next",
    page: (p: number, n: number) => `Page ${p} of ${n}`,
  },
  ar: {
    title: "ملاحظات الورشة",
    intro: "إرشادات صيانة وإصلاح خاصة بكل علامة من ورشة SHWURX في دبي، مُراجعة مقابل مصادر الشركات المصنّعة.",
    search: "ابحث في المقالات",
    brand: "العلامة",
    service: "الخدمة",
    allBrands: "كل العلامات",
    allServices: "كل الخدمات",
    apply: "تصفية",
    clear: "مسح",
    results: (n: number) => `${n} مقالة`,
    empty: "لا توجد مقالات مطابقة بعد. جرّب علامة أخرى أو امسح عوامل التصفية.",
    none: "لم تُنشر أي مقالات بعد.",
    prev: "السابق",
    next: "التالي",
    page: (p: number, n: number) => `الصفحة ${p} من ${n}`,
  },
}

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

function readFilters(sp: Record<string, string | string[] | undefined>): ArticleFilters {
  return {
    brand: one(sp.brand) || undefined,
    service: one(sp.service) || undefined,
    q: one(sp.q).slice(0, 80) || undefined,
    page: Number.parseInt(one(sp.page), 10) || 1,
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [{ doc, lang, preview }, sp] = await Promise.all([siteContext(), searchParams])
  const u = UI[lang]
  const f = readFilters(sp)
  const meta = buildMetadata(
    doc,
    lang,
    "/blog",
    { title: { en: UI.en.title, ar: UI.ar.title }, description: { en: UI.en.intro, ar: UI.ar.intro }, ogImageId: null, noindex: false },
    preview,
  )
  // Filtered, searched and paginated views consolidate onto the canonical index.
  if (!meta.robots && (f.brand || f.service || f.q || (f.page ?? 1) > 1)) meta.robots = { index: false, follow: true }
  return { ...meta, title: { absolute: `${u.title}${pick(doc.seo.titleSuffix, lang)}` } }
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Search }) {
  const [{ doc, lang }, sp] = await Promise.all([siteContext(), searchParams])
  const u = UI[lang]
  const live = await listLiveArticles(lang)
  const f = readFilters(sp)
  const { items, total, page, pages } = queryArticles(live, lang, f)

  // Only offer filters that lead to at least one article.
  const brands = doc.brands.filter((b) => b.visible && live.some((a) => a.brandSlug === b.slug))
  const services = doc.services.filter((s) => s.visible && live.some((a) => a.serviceSlugs.includes(s.slug)))
  const brandName = (slug: string | null) => (slug ? pick(doc.brands.find((b) => b.slug === slug)?.name, lang) : "")
  const filtered = !!(f.brand || f.service || f.q)

  const pageHref = (p: number) => {
    const qs = new URLSearchParams()
    if (f.brand) qs.set("brand", f.brand)
    if (f.service) qs.set("service", f.service)
    if (f.q) qs.set("q", f.q)
    if (p > 1) qs.set("page", String(p))
    const s = qs.toString()
    return localePath(lang, "/blog") + (s ? `?${s}` : "")
  }

  const field = "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground"

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
      <header className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">{u.title}</h1>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{u.intro}</p>
      </header>

      {live.length > 0 && (
        <form method="get" action={localePath(lang, "/blog")} role="search" className="mt-10 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            {u.search}
            <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={80} className={field} />
          </label>
          {brands.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-medium md:w-52">
              {u.brand}
              <select name="brand" defaultValue={f.brand ?? ""} className={field}>
                <option value="">{u.allBrands}</option>
                {brands.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {pick(b.name, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {services.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-medium md:w-52">
              {u.service}
              <select name="service" defaultValue={f.service ?? ""} className={field}>
                <option value="">{u.allServices}</option>
                {services.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {pick(s.name, lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              {u.apply}
            </button>
            {filtered && (
              <Link href={localePath(lang, "/blog")} className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
                {u.clear}
              </Link>
            )}
          </div>
        </form>
      )}

      {live.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {u.results(total)}
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          {live.length === 0 ? u.none : u.empty}
        </p>
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} lang={lang} brandName={brandName(a.brandSlug)} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label={u.page(page, pages)} className="mt-12 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link rel="prev" href={pageHref(page - 1)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              {u.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{u.page(page, pages)}</span>
          {page < pages ? (
            <Link rel="next" href={pageHref(page + 1)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              {u.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
