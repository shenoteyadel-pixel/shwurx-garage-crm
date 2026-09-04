import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, MapPin } from "lucide-react"
import { SITE_SERVICES } from "@/lib/site-services"
import { getPublicSiteInfo } from "@/lib/site-info"
import { HomeCtaTracker } from "@/components/site/home-cta-tracker"

export const metadata: Metadata = {
  title: "SHWURX Garage — Premium Auto Service & Repair",
  description:
    "Precision auto care in the UAE. Book your service online, track your vehicle in real time, and drive away with confidence.",
}

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: "Genuine parts", text: "Manufacturer-grade parts and warranty-safe servicing." },
  { icon: Clock, title: "Live tracking", text: "Follow every stage of your repair from your phone." },
  { icon: CheckCircle2, title: "Transparent quotes", text: "Approve work item-by-item before we start." },
]

export default async function HomePage() {
  const info = await getPublicSiteInfo()

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/site/hero-garage.png"
            alt="Luxury car being serviced in the SHWURX workshop"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="mx-auto flex max-w-6xl flex-col justify-center px-4 py-24 md:py-36 lg:px-8">
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Trusted auto specialists
          </span>
          <h1 className="max-w-2xl text-balance text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Precision care for the cars you <span className="text-primary">love</span>.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            From routine servicing to complex repairs, {info.companyName} keeps you moving with
            dealer-level expertise, honest pricing, and real-time updates on your vehicle.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <HomeCtaTracker />
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="border-y border-border bg-card/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3 lg:px-8">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <h.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{h.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{h.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-20 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">What we do</h2>
            <p className="mt-2 max-w-lg text-pretty text-muted-foreground">
              A full-service workshop under one roof — whatever your car needs, we handle it properly.
            </p>
          </div>
          <Link href="/services" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            All services <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_SERVICES.map((s) => (
            <div
              key={s.slug}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:border-primary/50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-16 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">
              Ready to book your car in?
            </h2>
            <p className="mt-2 max-w-md text-pretty text-muted-foreground">
              Reserve a slot in under a minute. We&apos;ll confirm your appointment and take it from there.
            </p>
            {info.address && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" /> {info.address}
              </p>
            )}
          </div>
          <Link
            href="/appointment"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            Book Appointment <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  )
}
