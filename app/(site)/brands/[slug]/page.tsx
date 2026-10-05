import type { Metadata } from "next"
import Link from "next/link"
import { EnquirySection } from "@/components/site/enquiry-section"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { buildMetadata, localePath, pick, publicMedia, siteContext, SITE_URL } from "@/lib/website/render"
import { FaqList } from "@/components/site/faq-list"
import { MediaGallery } from "@/components/site/media-gallery"

export const dynamic = "force-dynamic"

const UI = {
  en: {
    models: "Model scope",
    from: "from",
    knowledge: "What we check",
    services: "Services for this brand",
    faq: "Questions",
    cta: "Send an enquiry",
    gallery: "From our workshop",
    caseStudies: "Documented jobs",
    family: "A model family by",
  },
  ar: {
    models: "نطاق الموديلات",
    from: "من",
    knowledge: "ما الذي نفحصه",
    services: "الخدمات لهذه العلامة",
    faq: "الأسئلة",
    cta: "أرسل استفساراً",
    gallery: "من ورشتنا",
    caseStudies: "أعمال موثقة",
    family: "فئة طرازات من",
  },
}

async function load(slug: string) {
  const ctx = await siteContext()
  const brand = ctx.doc.brands.find((b) => b.slug === slug && b.visible)
  return { ...ctx, brand }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { doc, lang, brand } = await load(slug)
  if (!brand) return {}
  return buildMetadata(doc, lang, `/brands/${brand.slug}`, brand.seo)
}

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { doc, lang, brand } = await load(slug)
  if (!brand) notFound()
  const u = UI[lang]
  const logo = publicMedia(doc, brand.logoId)
  const services = brand.serviceSlugs
    .map((s) => doc.services.find((x) => x.slug === s && x.visible))
    .filter((s): s is NonNullable<typeof s> => !!s)
  const gallery = brand.galleryIds.map((id) => publicMedia(doc, id)).filter((m): m is NonNullable<typeof m> => !!m)
  const cases = brand.caseStudies.filter((c) => c.documented)
  const { preview } = await siteContext()
  const enquire = "#enquire"

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: pick(doc.business.name, lang),
    address: { "@type": "PostalAddress", streetAddress: pick(doc.business.address, lang), addressLocality: "Dubai", addressCountry: "AE" },
    telephone: doc.business.phone || undefined,
    url: `${SITE_URL}${localePath(lang, `/brands/${brand.slug}`)}`,
    knowsAbout: `${brand.name.en} repair`,
  }

  return (
    <>
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          {brand.kind === "model_family" && brand.parentName && (
            <p className="text-sm font-medium text-muted-foreground">
              {u.family} {pick(brand.parentName, lang)}
            </p>
          )}
          <h1 className="mt-1 text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(brand.seo.title, lang) || pick(brand.name, lang)}</h1>
          <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground">{pick(brand.intro, lang)}</p>
          <Link
            href={enquire}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            {u.cta} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
        </div>
        {logo && (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-border bg-card">
            <Image src={logo.url || "/placeholder.svg"} alt={pick(logo.alt, lang)} width={72} height={72} className="h-16 w-16 object-contain dark:invert" />
          </div>
        )}
      </header>

      <section className="mt-14" aria-labelledby="models">
        <h2 id="models" className="text-xl font-semibold">{u.models}</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {brand.models.map((m) => (
            <li key={m.id} className="rounded-full border border-border bg-card px-4 py-2 text-sm">
              <span className="font-medium" dir="ltr">{m.name}</span>{" "}
              <span className="text-muted-foreground" dir="ltr">
                {m.yearTo ? `${m.yearFrom}–${m.yearTo}` : `${m.yearFrom}+`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14" aria-labelledby="knowledge">
        <h2 id="knowledge" className="text-xl font-semibold">{u.knowledge}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {brand.knowledge.map((k) => (
            <article key={k.id} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold">{pick(k.title, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(k.body, lang)}</p>
            </article>
          ))}
        </div>
      </section>

      {services.length > 0 && (
        <section className="mt-14" aria-labelledby="services">
          <h2 id="services" className="text-xl font-semibold">{u.services}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <li key={s.id}>
                <Link
                  href={localePath(lang, `/services/${s.slug}`)}
                  className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 hover:border-primary/60"
                >
                  <span className="font-semibold">{pick(s.name, lang)}</span>
                  <span className="mt-1 text-sm leading-relaxed text-muted-foreground">{pick(s.summary, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="mt-14" aria-labelledby="gallery">
          <h2 id="gallery" className="text-xl font-semibold">{u.gallery}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {gallery.map((g) => (
              <Image
                key={g.id}
                src={g.url || "/placeholder.svg"}
                alt={pick(g.alt, lang)}
                width={g.width ?? 800}
                height={g.height ?? 600}
                className="aspect-[4/3] w-full rounded-xl object-cover"
                style={{ objectPosition: `${g.focalX}% ${g.focalY}%` }}
              />
            ))}
          </div>
        </section>
      )}

      {cases.length > 0 && (
        <section className="mt-14" aria-labelledby="cases">
          <h2 id="cases" className="text-xl font-semibold">{u.caseStudies}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {cases.map((c) => (
              <article key={c.id} className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold">{pick(c.title, lang)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(c.body, lang)}</p>
                <MediaGallery doc={doc} lang={lang} ids={c.mediaIds} compact />
              </article>
            ))}
          </div>
        </section>
      )}

      {brand.faqs.length > 0 && (
        <section className="mt-14" aria-labelledby="faq">
          <h2 id="faq" className="text-xl font-semibold">{u.faq}</h2>
          <FaqList items={brand.faqs.map((f) => ({ id: f.id, q: pick(f.q, lang), a: pick(f.a, lang) }))} />
        </section>
      )}
    </div>
    <EnquirySection doc={doc} lang={lang} preview={preview} formId={`brand-${brand.slug}`} brandSlug={brand.slug} />
    </>
  )
}
