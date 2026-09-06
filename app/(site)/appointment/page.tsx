import type { Metadata } from "next"
import { CalendarClock, PhoneCall, CheckCircle2 } from "lucide-react"
import { AppointmentForm } from "@/components/site/appointment-form"
import { getPublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"

export const metadata: Metadata = {
  title: "Book an Appointment — SHWURX Auto Service Center",
  description: "Reserve your service slot online. We'll confirm your appointment by phone.",
}

export default async function AppointmentPage() {
  const [info, { dict }] = await Promise.all([getPublicSiteInfo(), getServerI18n()])
  const t = dict.appointmentPage

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-primary" /> {t.badge}
          </span>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight md:text-5xl">{t.title}</h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{t.body}</p>

          <ul className="mt-8 flex flex-col gap-4">
            {t.points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-muted-foreground">{p}</span>
              </li>
            ))}
          </ul>

          {info.phone && (
            <div className="mt-8 rounded-2xl border border-border bg-card/50 p-5">
              <div className="flex items-center gap-3">
                <PhoneCall className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{t.preferToCall}</p>
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

        <AppointmentForm />
      </div>
    </div>
  )
}
