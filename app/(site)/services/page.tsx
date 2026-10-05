import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Car, Cpu, HardDrive, PaintBucket, ScanSearch, Wrench, type LucideIcon } from "lucide-react"
import { getServerI18n } from "@/lib/i18n/server"
import { buildMetadata, localePath, pick, siteContext } from "@/lib/website/render"
import type { ServiceKind } from "@/lib/website/types"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  return buildMetadata(doc, lang, "/services", doc.pages.servicesIndex.seo, preview)
}

const ICONS: Record<ServiceKind, LucideIcon> = {
  mechanical: Wrench,
  diagnostics: ScanSearch,
  bodywork: Car,
  painting: PaintBucket,
  programming_online: Cpu,
  programming_offline: HardDrive,
}

export default async function ServicesPage() {
  const [{ doc, lang, source }, { dict }] = await Promise.all([siteContext(), getServerI18n()])
  const t = dict.servicesPage
  const page = doc.pages.servicesIndex
  // Before the first explicit publish, production keeps the old services list
  // (cards only); per-service detail pages stay hidden until published.
  const legacy = source === "legacy"
  const services = legacy ? doc.services : doc.services.filter((s) => s.visible)

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{pick(page.intro, lang)}</p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const Icon = ICONS[s.kind] ?? Wrench
          const body = (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{pick(s.name, lang)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(s.summary, lang)}</p>
            </>
          )
          return legacy ? (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-6">
              {body}
            </div>
          ) : (
            <Link
              key={s.id}
              href={localePath(lang, `/services/${s.slug}`)}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:border-primary/50"
            >
              {body}
            </Link>
          )
        })}
      </div>

      <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-card/40 p-8 md:flex-row md:items-center">
        <div>
          <h2 className="text-balance text-2xl font-bold tracking-tight">{t.notSureTitle}</h2>
          <p className="mt-2 max-w-md text-pretty text-muted-foreground">{t.notSureBody}</p>
        </div>
        <Link
          href={localePath(lang, "/appointment")}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {dict.cta.bookAppointment} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}
