import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ClipboardCheck, MessageSquare, ScanSearch } from "lucide-react"
import { getServerI18n } from "@/lib/i18n/server"
import { buildMetadata, localePath, pick, publicMedia, siteContext } from "@/lib/website/render"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  return buildMetadata(doc, lang, "/about", doc.pages.about.seo, preview)
}

const STAT_ICONS = [ScanSearch, ClipboardCheck, MessageSquare]

export default async function AboutPage() {
  const [{ doc, lang }, { dict }] = await Promise.all([siteContext(), getServerI18n()])
  const t = dict.aboutPage
  const page = doc.pages.about
  const image = publicMedia(doc, page.imageId)
  const paragraphs = pick(page.body, lang).split(/\n{2,}/).filter(Boolean)

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
          {paragraphs.map((p, i) => (
            <p key={i} className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{p}</p>
          ))}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
          <Image
            src={image?.url || "/site/workshop-team.png"}
            alt={(image && pick(image.alt, lang)) || "SHWURX technician inspecting a vehicle"}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
            style={image ? { objectPosition: `${image.focalX}% ${image.focalY}%` } : undefined}
          />
        </div>
      </div>

      {doc.pages.process.length > 0 && (
        <ol className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {doc.pages.process.map((s, i) => {
            const Icon = STAT_ICONS[i % STAT_ICONS.length]
            return (
              <li key={s.id} className="rounded-2xl border border-border bg-card p-6">
                <Icon className="h-6 w-6 text-primary" />
                <div className="mt-4 text-lg font-bold tracking-tight">{pick(s.title, lang)}</div>
                <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{pick(s.body, lang)}</div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-14 flex justify-center">
        <Link
          href={localePath(lang, "/appointment")}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t.bookWithUs} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}
