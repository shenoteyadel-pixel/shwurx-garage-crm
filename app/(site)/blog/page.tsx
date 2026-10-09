import type { Metadata } from "next"
import Link from "next/link"
import { buildMetadata, localePath, pick, siteContext } from "@/lib/website/render"
import { listLiveArticles } from "@/lib/blog"
import { queryArticles, type ArticleFilters } from "@/lib/article-model"
import { ArticleCard } from "@/components/site/article-card"
import { CarFinder } from "@/components/site/car-finder"

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
    apply: "Show notes for my car",
    clear: "Clear",
    finderHeading: "Find notes for your car",
    finderHint: "Choose your brand and model, and optionally a service. Guides for your exact model are listed first.",
    model: "Model",
    allModels: "All models",
    pickBrandFirst: "Choose a brand first",
    yourCar: "Your car",
    modelHits: (n: number, m: string) => (n === 0 ? `No guide is written for the ${m} yet, so these cover the brand in general.` : n === 1 ? `1 guide is written for the ${m}.` : `${n} guides are written for the ${m}.`),
    matchBadge: "Your model",
    book: "Book an appointment",
    brandPage: "Brand page",
    noneForCar: "We have not published notes for this car yet. Our technicians still work on it every week, so book an inspection or open the brand page.",
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
    apply: "اعرض ملاحظات سيارتي",
    clear: "مسح",
    finderHeading: "ابحث عن ملاحظات لسيارتك",
    finderHint: "اختر العلامة والموديل، ويمكنك اختيار خدمة أيضاً. تظهر الأدلة الخاصة بموديلك أولاً.",
    model: "الموديل",
    allModels: "كل الموديلات",
    pickBrandFirst: "اختر العلامة أولاً",
    yourCar: "سيارتك",
    modelHits: (n: number, m: string) => (n === 0 ? `لا يوجد دليل مكتوب لـ ${m} بعد، لذلك تعرض هذه المقالات العلامة بشكل عام.` : `${n} دليل مكتوب لـ ${m}.`),
    matchBadge: "موديلك",
    book: "احجز موعداً",
    brandPage: "صفحة العلامة",
    noneForCar: "لم ننشر ملاحظات لهذه السيارة بعد. يعمل فنيونا عليها كل أسبوع، لذا احجز فحصاً أو افتح صفحة العلامة.",
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
    model: one(sp.model).slice(0, 60) || undefined,
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
  if (!meta.robots && (f.brand || f.service || f.q || f.model || (f.page ?? 1) > 1)) meta.robots = { index: false, follow: true }
  return { ...meta, title: { absolute: `${u.title}${pick(doc.seo.titleSuffix, lang)}` } }
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Search }) {
  const [{ doc, lang }, sp] = await Promise.all([siteContext(), searchParams])
  const u = UI[lang]
  const live = await listLiveArticles(lang)
  const f = readFilters(sp)
  const visibleBrands = doc.brands.filter((b) => b.visible)
  const selectedBrand = visibleBrands.find((b) => b.slug === f.brand)
  // Only accept a model that belongs to the chosen brand.
  if (f.model && !selectedBrand?.models.some((m) => m.name === f.model)) f.model = undefined
  const { items, total, page, pages, modelMatches, modelIds } = queryArticles(live, lang, f)

  const brands = visibleBrands
    .map((b) => ({ slug: b.slug, name: pick(b.name, lang), models: b.models.map((m) => m.name) }))
    .sort((x, y) => x.name.localeCompare(y.name, lang))
  const services = doc.services.filter((s) => s.visible).map((s) => ({ slug: s.slug, name: pick(s.name, lang) }))
  const selectedService = services.find((s) => s.slug === f.service)
  const brandName = (slug: string | null) => (slug ? pick(doc.brands.find((b) => b.slug === slug)?.name, lang) : "")
  const filtered = !!(f.brand || f.service || f.q || f.model)
  const bookHref = doc.pages.appointment.visible ? localePath(lang, "/appointment") : localePath(lang, "/contact")
  const carLabel = selectedBrand ? [pick(selectedBrand.name, lang), f.model].filter(Boolean).join(" ") : ""

  const pageHref = (p: number) => {
    const qs = new URLSearchParams()
    if (f.brand) qs.set("brand", f.brand)
    if (f.model) qs.set("model", f.model)
    if (f.service) qs.set("service", f.service)
    if (f.q) qs.set("q", f.q)
    if (p > 1) qs.set("page", String(p))
    const s = qs.toString()
    return localePath(lang, "/blog") + (s ? `?${s}` : "")
  }


  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
      <header className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">{u.title}</h1>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{u.intro}</p>
      </header>

      {live.length > 0 && (
        <CarFinder
          action={localePath(lang, "/blog")}
          clearHref={localePath(lang, "/blog")}
          brands={brands}
          services={services}
          filtered={filtered}
          initial={{ brand: selectedBrand?.slug ?? "", model: f.model ?? "", service: f.service ?? "", q: f.q ?? "" }}
          labels={{
            heading: u.finderHeading,
            hint: u.finderHint,
            brand: u.brand,
            model: u.model,
            service: u.service,
            search: u.search,
            allBrands: u.allBrands,
            allModels: u.allModels,
            pickBrandFirst: u.pickBrandFirst,
            allServices: u.allServices,
            apply: u.apply,
            clear: u.clear,
          }}
        />
      )}

      {selectedBrand && (
        <section aria-labelledby="your-car" className="mt-6 flex flex-col gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-5 md:flex-row md:items-center md:justify-between lg:p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{u.yourCar}</p>
            <h2 id="your-car" className="text-balance text-xl font-bold tracking-tight">
              {carLabel}
              {selectedService && <span className="font-medium text-muted-foreground">{` · ${selectedService.name}`}</span>}
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {total === 0 ? u.noneForCar : f.model ? u.modelHits(modelMatches, f.model) : u.results(total)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={bookHref} className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              {u.book}
            </Link>
            <Link href={localePath(lang, `/brands/${selectedBrand.slug}`)} className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
              {u.brandPage}
            </Link>
          </div>
        </section>
      )}

      {live.length > 0 && !selectedBrand && (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {u.results(total)}
        </p>
      )}

      {items.length === 0 ? (
        !selectedBrand && (
          <p className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
            {live.length === 0 ? u.none : u.empty}
          </p>
        )
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <li key={a.id} className="relative">
              {modelIds.has(a.id) && (
                <span className="pointer-events-none absolute start-3 top-3 z-10 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                  {u.matchBadge}
                </span>
              )}
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
