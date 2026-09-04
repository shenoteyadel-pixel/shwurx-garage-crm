import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SITE_SERVICES } from "@/lib/site-services"

export const metadata: Metadata = {
  title: "Services — SHWURX Garage",
  description:
    "Major and minor servicing, diagnostics, engine and mechanical repair, detailing, A/C, electrical, and pre-purchase inspections.",
}

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">Our services</h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          One trusted workshop for everything your car needs — carried out by specialist technicians using
          genuine parts, with transparent quotes you approve before any work begins.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SITE_SERVICES.map((s) => (
          <div key={s.slug} className="rounded-2xl border border-border bg-card p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <s.icon className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.summary}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-card/40 p-8 md:flex-row md:items-center">
        <div>
          <h2 className="text-balance text-2xl font-bold tracking-tight">Not sure what you need?</h2>
          <p className="mt-2 max-w-md text-pretty text-muted-foreground">
            Book a visit and our advisors will diagnose the issue and walk you through the options — no pressure.
          </p>
        </div>
        <Link
          href="/appointment"
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          Book Appointment <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  )
}
