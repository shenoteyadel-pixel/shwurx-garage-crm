import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { EnquirySection } from "@/components/site/enquiry-section"
import { FaqList } from "@/components/site/faq-list"
import { buildMetadata, localePath, pick, publicMedia, siteContext } from "@/lib/website/render"

export const dynamic = "force-dynamic"

async function load(slug: string) {
  const ctx = await siteContext()
  const page = ctx.doc.pages.custom.find((p) => p.slug === slug && p.visible)
  return { ...ctx, page }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { doc, lang, page } = await load(slug)
  if (!page) return {}
  return buildMetadata(doc, lang, `/pages/${page.slug}`, page.seo)
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { doc, lang, preview, page } = await load(slug)
  if (!page) notFound()

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
        {pick(page.intro, lang) && (
          <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground">{pick(page.intro, lang)}</p>
        )}
        <div className="mt-12 flex flex-col gap-12">
          {page.blocks.map((block) => {
            const heading = pick(block.heading, lang)
            if (block.type === "text") {
              return (
                <section key={block.id}>
                  {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
                  <p className="mt-3 whitespace-pre-line text-pretty leading-relaxed text-muted-foreground">{pick(block.body, lang)}</p>
                </section>
              )
            }
            if (block.type === "gallery") {
              const media = block.mediaIds.map((id) => publicMedia(doc, id)).filter((m): m is NonNullable<typeof m> => !!m)
              if (media.length === 0) return null
              return (
                <section key={block.id}>
                  {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {media.map((m) => (
                      <Image
                        key={m.id}
                        src={m.url || "/placeholder.svg"}
                        alt={pick(m.alt, lang)}
                        width={m.width ?? 800}
                        height={m.height ?? 600}
                        className="aspect-[4/3] w-full rounded-xl object-cover"
                        style={{ objectPosition: `${m.focalX}% ${m.focalY}%` }}
                      />
                    ))}
                  </div>
                </section>
              )
            }
            if (block.type === "faq") {
              return (
                <section key={block.id}>
                  {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
                  <FaqList items={block.faqs.map((f) => ({ id: f.id, q: pick(f.q, lang), a: pick(f.a, lang) }))} />
                </section>
              )
            }
            return (
              <section key={block.id} className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
                {heading && <h2 className="text-xl font-semibold">{heading}</h2>}
                <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{pick(block.body, lang)}</p>
                <a href={doc.pages.appointment.visible ? localePath(lang, "/appointment") : "#enquire"} className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  {lang === "ar" ? "احجز موعداً" : "Book an appointment"}
                </a>
              </section>
            )
          })}
        </div>
      </div>
      <EnquirySection
        doc={doc}
        lang={lang}
        preview={preview}
        formId={`page-${page.slug}`}
        brandSlug={page.brandSlug}
        serviceSlug={page.serviceSlug}
      />
    </>
  )
}
