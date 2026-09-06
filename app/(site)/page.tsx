import type { Metadata } from "next"
import Image from "next/image"
import {
  ArrowRight,
  UserCog,
  Cpu,
  BadgeCheck,
  Star,
  ClipboardCheck,
  HeartHandshake,
} from "lucide-react"
import { SITE_SERVICES } from "@/lib/site-services"
import { getPublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"
import { interpolate } from "@/lib/i18n/dictionaries"
import { TrackLink } from "@/components/site/track-link"

export const metadata: Metadata = {
  title: "SHWURX Auto Service Center — Premium & Luxury Vehicle Specialists",
  description:
    "More than a garage — a complete solution. Diagnostics, programming, repair, parts, body & paint for premium and luxury vehicles. One garage. Limitless solutions.",
}

const HERO_ICONS = [UserCog, Cpu, BadgeCheck]
const WALL_WORDS = ["DIAGNOSE", "REPAIR", "PROGRAM", "MAINTAIN", "PERFORM"]
const ABOUT_ICONS = [Star, Cpu, BadgeCheck, ClipboardCheck, HeartHandshake]

const VEHICLES = [
  { label: "Sedan", img: "/vehicles/sedan.png" },
  { label: "SUV", img: "/vehicles/suv.png" },
  { label: "Coupe", img: "/vehicles/coupe.png" },
  { label: "Convertible", img: "/vehicles/convertible.png" },
  { label: "Sports Car", img: "/vehicles/sports.png" },
  { label: "4x4", img: "/vehicles/fourbyfour.png" },
  { label: "Electric / Hybrid", img: "/vehicles/electric.png" },
] as const

const BRANDS = [
  { name: "Mercedes-Benz", file: "mercedes" },
  { name: "BMW", file: "bmw" },
  { name: "Audi", file: "audi" },
  { name: "Porsche", file: "porsche" },
  { name: "Land Rover", file: "landrover" },
  { name: "Range Rover", file: "landrover" },
  { name: "Bentley", file: "bentley" },
  { name: "Ferrari", file: "ferrari" },
  { name: "Lamborghini", file: "lamborghini" },
  { name: "Maserati", file: "maserati" },
  { name: "Volkswagen", file: "volkswagen" },
  { name: "Jaguar", file: "jaguar" },
  { name: "Rolls-Royce", file: "rollsroyce" },
  { name: "Aston Martin", file: "astonmartin" },
  { name: "McLaren", file: "mclaren" },
]

export default async function HomePage() {
  const [info, { dict }] = await Promise.all([getPublicSiteInfo(), getServerI18n()])
  const t = dict.home

  return (
    <>
      {/* ============ HERO ============ */}
      <section className="relative isolate overflow-hidden border-b border-border bg-background">
        {/* Desktop hero image bleeding to the right edge */}
        <div className="absolute inset-y-0 right-0 z-0 hidden w-[62%] lg:block">
          <Image
            src="/site/hero-porsche.png"
            alt="Porsche parked in the SHWURX Auto Service Center workshop"
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/45 to-transparent rtl:bg-gradient-to-l" />
          <div className="absolute inset-y-0 right-8 hidden flex-col justify-center gap-2 text-right xl:flex">
            {WALL_WORDS.map((w) => (
              <span key={w} className="text-3xl font-black uppercase tracking-wide text-foreground/[0.07]">
                {w}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div className="py-14 lg:py-28">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                {t.heroEyebrow}
              </p>
              <h1 className="mt-5 text-balance text-4xl font-black uppercase leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">
                {t.heroTitle1}
                <br />
                <span className="text-primary">{t.heroTitle2}</span>
              </h1>
              <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
                {t.heroSubtitle1}
                <br className="hidden sm:block" /> {t.heroSubtitle2}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <TrackLink
                  href="/appointment"
                  label="Book a Service — hero"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  {dict.cta.bookService} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </TrackLink>
                <TrackLink
                  href="/contact"
                  label="Get a Quote — hero"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card/60 px-7 text-sm font-semibold text-foreground backdrop-blur transition hover:border-primary/60 hover:bg-accent"
                >
                  {dict.cta.getQuote}
                </TrackLink>
              </div>

              <div className="mt-12 grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-3">
                {t.features.map((f, i) => {
                  const Icon = HERO_ICONS[i]
                  return (
                    <div key={f.title} className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-bold leading-tight">{f.title}</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{f.sub}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mobile hero image */}
            <div className="relative -mx-4 h-64 sm:h-80 lg:hidden">
              <Image
                src="/site/hero-porsche.png"
                alt="Porsche parked in the SHWURX Auto Service Center workshop"
                fill
                priority
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ============ SERVICES ============ */}
      <section className="relative z-20 bg-background">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="-mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:-mt-16 lg:grid-cols-6">
            {SITE_SERVICES.map((s) => {
              const st = dict.services[s.slug as keyof typeof dict.services]
              return (
                <div
                  key={s.slug}
                  className="group rounded-lg border border-border bg-card p-5 transition hover:border-primary/50 hover:bg-card/80"
                >
                  <s.icon className="h-7 w-7 text-foreground transition group-hover:text-primary" strokeWidth={1.5} />
                  <h3 className="mt-4 text-sm font-bold leading-tight">{st.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{st.summary}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============ ABOUT ============ */}
      <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{t.aboutEyebrow}</p>
            <h2 className="mt-4 text-balance text-3xl font-black uppercase leading-[1.02] tracking-tight md:text-4xl">
              {t.aboutTitle1}
              <br />
              <span className="text-primary">{t.aboutTitle2}</span>
            </h2>
            <p className="mt-5 text-pretty text-sm leading-relaxed text-muted-foreground">
              {interpolate(t.aboutBody, { company: info.companyName })}
            </p>
            <TrackLink
              href="/about"
              label="Learn More — about"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-md border border-border px-5 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent"
            >
              {dict.cta.learnMore} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </TrackLink>
          </div>

          <div className="relative h-64 overflow-hidden rounded-xl border border-border lg:h-80">
            <Image
              src="/site/about-tech.png"
              alt="SHWURX technician running diagnostics on a luxury vehicle"
              fill
              className="object-cover"
            />
          </div>

          <ul className="flex flex-col gap-4">
            {t.aboutPoints.map((text, i) => {
              const Icon = ABOUT_ICONS[i]
              return (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <span className="text-sm font-medium">{text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ============ VEHICLE TYPES ============ */}
      <section className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {t.vehicleTypesHeading}
          </h2>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-7">
          {VEHICLES.map((v) => (
            <div key={v.label} className="flex flex-col items-center">
              <div className="relative h-20 w-full">
                <Image src={v.img} alt={t.vehicles[v.label]} fill className="object-contain" />
              </div>
              <span className="mt-3 text-center text-xs font-medium text-muted-foreground">{t.vehicles[v.label]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PREMIUM & LUXURY BRANDS ============ */}
      <section
        id="brands"
        className="scroll-mt-24 border-y border-border bg-muted dark:bg-[radial-gradient(ellipse_at_top,oklch(0.2_0_0),oklch(0.11_0_0))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8 lg:py-24">
          <div className="text-center">
            <h2 className="text-balance text-2xl font-black uppercase tracking-tight md:text-3xl">
              {t.brandsHeading}
            </h2>
            <p className="mt-3 text-lg font-bold uppercase tracking-wide" dir="ltr">
              ONE GARAGE. <span className="text-primary">LIMITLESS SOLUTIONS.</span>
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm text-muted-foreground">{t.brandsSub}</p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-3 items-start justify-items-center gap-x-6 gap-y-10 sm:grid-cols-5 lg:grid-cols-9">
            {BRANDS.map((b) => (
              <div key={b.name} className="flex w-full flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/brands/${b.file}.svg`}
                  alt={`${b.name} logo`}
                  className="h-9 w-9 object-contain opacity-70 transition hover:opacity-100 dark:invert"
                />
                <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {b.name}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-col items-center gap-5">
            <span className="h-px w-full max-w-3xl bg-border" />
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                {interpolate(t.brandsMissing, { company: info.companyName })}
              </p>
              <TrackLink
                href="/contact"
                label="Contact Us — brands"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                {dict.cta.contactUs} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </TrackLink>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA BAR ============ */}
      <section className="bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight md:text-2xl">{t.ctaTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t.ctaSubtitle}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <TrackLink
              href="/appointment"
              label="Book a Service — cta bar"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-background px-7 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent"
            >
              {dict.cta.bookService} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </TrackLink>
            <TrackLink
              href="/contact"
              label="Get a Quote — cta bar"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {dict.cta.getQuote} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </TrackLink>
          </div>
        </div>
      </section>
    </>
  )
}
