import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClock, PhoneCall, CheckCircle2 } from "lucide-react"
import { AppointmentForm } from "@/components/site/appointment-form"
import { publicSiteInfo } from "@/lib/site-info"
import { buildMetadata, localePath, pick, siteContext } from "@/lib/website/render"
import { appointmentAvailable, appointmentServices } from "@/lib/website/appointment"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  if (!doc.pages.appointment.visible) return { robots: { index: false, follow: false } }
  return buildMetadata(doc, lang, "/appointment", doc.pages.appointment.seo, preview)
}

export default async function AppointmentPage() {
  const { doc, lang } = await siteContext()
  if (!doc.pages.appointment.visible) notFound()
  const info = publicSiteInfo(doc, lang)
  const t = doc.pages.appointment

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-primary" /> {pick(t.badge, lang)}
          </span>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(t.title, lang)}</h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{pick(t.body, lang)}</p>

          <ul className="mt-8 flex flex-col gap-4">
            {t.points.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-muted-foreground">{pick(p, lang)}</span>
              </li>
            ))}
          </ul>

          {info.phone && (
            <div className="mt-8 rounded-2xl border border-border bg-card/50 p-5">
              <div className="flex items-center gap-3">
                <PhoneCall className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{pick(t.preferToCall, lang)}</p>
                  <a
                    href={`tel:${info.phone.replace(/\s+/g, "")}`}
                    className="text-sm font-semibold hover:text-primary"
                    dir="ltr"
                  >
                    {info.phone}
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {appointmentAvailable(doc) ? (
          <AppointmentForm config={doc.forms.appointment} lang={lang}
            services={appointmentServices(doc).map((s) => ({ value: s.name.en, label: pick(s.name, lang) }))} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8">
            <p>{pick(t.disabledMessage, lang)}</p>
            <Link className="mt-4 inline-block font-semibold text-primary underline" href={localePath(lang, "/contact")}>{pick(t.contactLabel, lang)}</Link>
          </div>
        )}
      </div>
    </div>
  )
}
