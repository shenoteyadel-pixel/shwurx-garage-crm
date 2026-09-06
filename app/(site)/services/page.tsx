import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SITE_SERVICES } from "@/lib/site-services"
import { getServerI18n } from "@/lib/i18n/server"

export const metadata: Metadata = {
  title: "Services — SHWURX Auto Service Center",
  description:
    "Major and minor servicing, diagnostics, engine and mechanical repair, detailing, A/C, electrical, and pre-purchase inspections.",
}

export default async function ServicesPage() {
  const { dict } = await getServerI18n()
  const t = dict.servicesPage

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{t.title}</h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{t.intro}</p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SITE_SERVICES.map((s) => {
          const st = dict.services[s.slug as keyof typeof dict.services]
          return (
            <div key={s.slug} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{st.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{st.summary}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-card/40 p-8 md:flex-row md:items-center">
        <div>
          <h2 className="text-balance text-2xl font-bold tracking-tight">{t.notSureTitle}</h2>
          <p className="mt-2 max-w-md text-pretty text-muted-foreground">{t.notSureBody}</p>
        </div>
        <Link
          href="/appointment"
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {dict.cta.bookAppointment} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}
