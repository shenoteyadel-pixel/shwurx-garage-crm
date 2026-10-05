import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { buildMetadata, localePath, pick, siteContext } from "@/lib/website/render"
import { FaqList } from "@/components/site/faq-list"

export const dynamic = "force-dynamic"

const UI = {
  en: { includes: "What it covers", how: "How it works", prepare: "Before you visit", faq: "Questions", brands: "Brands", cta: "Send an enquiry" },
  ar: { includes: "ما تشمله الخدمة", how: "طريقة العمل", prepare: "قبل زيارتك", faq: "الأسئلة", brands: "العلامات", cta: "أرسل استفساراً" },
}

async function load(slug: string) {
  const ctx = await siteContext()
  return { ...ctx, service: ctx.doc.services.find((s) => s.slug === slug && s.visible) }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { doc, lang, service } = await load(slug)
  if (!service) return {}
  return buildMetadata(doc, lang, `/services/${service.slug}`, service.seo)
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { doc, lang, service } = await load(slug)
  if (!service) notFound()
  const u = UI[lang]
  const brands = doc.brands.filter((b) => b.visible && b.serviceSlugs.includes(service.slug))

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 lg:px-8">
      <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(service.name, lang)}</h1>
      <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">{pick(service.intro, lang)}</p>
      <Link
        href={localePath(lang, `/appointment?service=${encodeURIComponent(service.slug)}`)}
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
      >
        {u.cta} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
      </Link>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">{u.includes}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {service.subservices.map((s) => (
            <article key={s.id} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold">{pick(s.title, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(s.body, lang)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">{u.how}</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-4">
          {service.steps.map((s, i) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-5">
              <span className="text-sm font-semibold text-primary">{i + 1}</span>
              <h3 className="mt-1 font-semibold">{pick(s.title, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(s.body, lang)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 rounded-2xl border border-border bg-card/40 p-6">
        <h2 className="text-lg font-semibold">{u.prepare}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(service.preparation, lang)}</p>
        {pick(service.scopeNote, lang) && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pick(service.scopeNote, lang)}</p>}
      </section>

      {brands.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold">{u.brands}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {brands.map((b) => (
              <li key={b.id}>
                <Link href={localePath(lang, `/brands/${b.slug}`)} className="inline-flex rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary/60">
                  {pick(b.name, lang)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {service.faqs.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-semibold">{u.faq}</h2>
          <FaqList items={service.faqs.map((f) => ({ id: f.id, q: pick(f.q, lang), a: pick(f.a, lang) }))} />
        </section>
      )}
    </div>
  )
}
