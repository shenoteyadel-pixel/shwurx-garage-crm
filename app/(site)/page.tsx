import type React from "react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  UserCog,
  Cpu,
  BadgeCheck,
  Star,
  ClipboardCheck,
  HeartHandshake,
  Wrench,
  ScanSearch,
  Car,
  PaintBucket,
  HardDrive,
  MapPin,
  type LucideIcon,
} from "lucide-react"
import { getPublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"
import { resolveImage } from "@/lib/site-content"
import { interpolate } from "@/lib/i18n/dictionaries"
import { TrackLink } from "@/components/site/track-link"
import { buildMetadata, localePath, pick, publicMedia, siteContext } from "@/lib/website/render"
import type { HomeSectionKey, ServiceKind, WebsiteDocument, Lang } from "@/lib/website/types"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  return buildMetadata(doc, lang, "/", doc.pages.home.seo, preview)
}

const HERO_ICONS = [UserCog, Cpu, BadgeCheck]
const WALL_WORDS = ["DIAGNOSE", "REPAIR", "PROGRAM", "MAINTAIN", "PERFORM"]
const ABOUT_ICONS = [Star, Cpu, BadgeCheck, ClipboardCheck, HeartHandshake]

const SERVICE_ICONS: Record<ServiceKind, LucideIcon> = {
  mechanical: Wrench,
  diagnostics: ScanSearch,
  bodywork: Car,
  painting: PaintBucket,
  programming_online: Cpu,
  programming_offline: HardDrive,
}

/** Bundled marks for brands that have no approved logo in the media library. */
const BUNDLED_LOGOS = new Set([
  "astonmartin", "audi", "bentley", "bmw", "ferrari", "jaguar", "lamborghini",
  "landrover", "maserati", "mclaren", "mercedes", "porsche", "rollsroyce", "volkswagen",
])

function brandLogo(doc: WebsiteDocument, lang: Lang, b: WebsiteDocument["brands"][number]) {
  const m = publicMedia(doc, b.logoId)
  if (m) return { url: m.url, alt: pick(m.alt, lang) || `${pick(b.name, lang)} logo`, bundled: false }
  const key = b.slug.replace(/-benz$/, "").replace(/[^a-z]/g, "")
  return BUNDLED_LOGOS.has(key) ? { url: `/brands/${key}.svg`, alt: `${pick(b.name, lang)} logo`, bundled: true } : null
}

export default async function HomePage() {
  const [{ doc, lang }, info, { dict }] = await Promise.all([siteContext(), getPublicSiteInfo(), getServerI18n()])
  const t = dict.home
  const home = doc.pages.home
  const heroMedia = publicMedia(doc, home.heroImageId)
  const heroImg = heroMedia?.url ?? resolveImage(doc.images, "home.hero", "/site/hero-porsche.png")
  const heroAlt = (heroMedia && pick(heroMedia.alt, lang)) || "Porsche parked in the SHWURX Auto Service Center workshop"
  const aboutMedia = publicMedia(doc, doc.pages.about.imageId)
  const aboutImg = aboutMedia?.url ?? resolveImage(doc.images, "home.about", "/site/about-tech.png")
  const services = doc.services.filter((s) => s.visible)
  const brands = doc.brands.filter((b) => b.visible && b.kind === "manufacturer")
  const lp = (p: string) => localePath(lang, p)
  const heroVisible = home.sections.some((s) => s.key === "hero" && s.visible)

  const sections: Partial<Record<HomeSectionKey, React.ReactNode>> = {
    hero: (
      <section key="hero" className="relative isolate overflow-hidden border-b border-border bg-background">
        <div className="absolute inset-y-0 right-0 z-0 hidden w-[62%] lg:block rtl:left-0 rtl:right-auto">
          <Image src={heroImg || "/placeholder.svg"} alt={heroAlt} fill priority sizes="62vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/45 to-transparent rtl:bg-gradient-to-l" />
          <div className="absolute inset-y-0 right-8 hidden flex-col justify-center gap-2 text-right xl:flex" aria-hidden="true">
            {WALL_WORDS.map((w) => (
              <span key={w} className="text-3xl font-black uppercase tracking-wide text-foreground/[0.07]">{w}</span>
            ))}
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div className="py-14 lg:py-28">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{pick(home.eyebrow, lang)}</p>
              <h1 className="mt-5 text-balance text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
                {pick(home.title, lang)}
              </h1>
              <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground">{pick(home.subtitle, lang)}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <TrackLink
                  href={lp("/appointment")}
                  label="Book a Service — hero"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  {dict.cta.bookService} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </TrackLink>
                <TrackLink
                  href={lp("/contact")}
                  label="Get a Quote — hero"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card/60 px-7 text-sm font-semibold text-foreground backdrop-blur transition hover:border-primary/60 hover:bg-accent"
                >
                  {dict.cta.getQuote}
                </TrackLink>
              </div>

              <div className="mt-12 grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-3">
                {t.features.map((f, i) => {
                  const Icon = HERO_ICONS[i] ?? BadgeCheck
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

            <div className="relative -mx-4 h-64 sm:h-80 lg:hidden">
              <Image src={heroImg || "/placeholder.svg"} alt={heroAlt} fill priority sizes="100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>
    ),

    services: services.length > 0 && (
      <section key="services" className="bg-background" aria-labelledby="home-services">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 id="home-services" className="text-2xl font-black uppercase tracking-tight md:text-3xl">{pick(doc.pages.servicesIndex.title, lang)}</h2>
            <Link href={lp("/services")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              {dict.cta.learnMore} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {services.map((s) => {
              const Icon = SERVICE_ICONS[s.kind] ?? Wrench
              return (
                <Link
                  key={s.id}
                  href={lp(`/services/${s.slug}`)}
                  className="group rounded-lg border border-border bg-card p-5 transition hover:border-primary/50"
                >
                  <Icon className="h-7 w-7 text-foreground transition group-hover:text-primary" strokeWidth={1.5} />
                  <h3 className="mt-4 text-sm font-bold leading-tight">{pick(s.name, lang)}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pick(s.summary, lang)}</p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    ),

    process: home.sections.length > 0 && doc.pages.process.length > 0 && (
      <section key="process" className="border-y border-border bg-card/40" aria-labelledby="home-process">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-3 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{t.aboutEyebrow}</p>
            <h2 id="home-process" className="mt-4 text-balance text-3xl font-black uppercase leading-[1.02] tracking-tight">
              {t.aboutTitle1} <span className="text-primary">{t.aboutTitle2}</span>
            </h2>
            <p className="mt-5 text-pretty text-sm leading-relaxed text-muted-foreground">
              {interpolate(t.aboutBody, { company: info.companyName })}
            </p>
            <div className="relative mt-6 h-48 overflow-hidden rounded-xl border border-border">
              <Image
                src={aboutImg || "/placeholder.svg"}
                alt={(aboutMedia && pick(aboutMedia.alt, lang)) || "SHWURX technician at work"}
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {doc.pages.process.map((p, i) => {
              const Icon = ABOUT_ICONS[i] ?? ClipboardCheck
              return (
                <li key={p.id} className="flex gap-4 rounded-xl border border-border bg-background p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                    <Icon className="h-5 w-5 text-primary" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">{pick(p.title, lang)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pick(p.body, lang)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>
    ),

    brands: brands.length > 0 && (
      <section key="brands" id="brands" className="scroll-mt-24 bg-muted dark:bg-[radial-gradient(ellipse_at_top,oklch(0.2_0_0),oklch(0.11_0_0))]">
        <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <div className="text-center">
            <h2 className="text-balance text-2xl font-black uppercase tracking-tight md:text-3xl">{pick(doc.pages.brandsIndex.title, lang)}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm text-muted-foreground">{pick(doc.pages.brandsIndex.intro, lang)}</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-3 justify-items-center gap-x-6 gap-y-10 sm:grid-cols-5 lg:grid-cols-8">
            {brands.map((b) => {
              const logo = brandLogo(doc, lang, b)
              return (
                <Link key={b.id} href={lp(`/brands/${b.slug}`)} className="group flex w-full flex-col items-center gap-2">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo.url}
                      alt={logo.alt}
                      className={`h-9 w-9 object-contain opacity-70 transition group-hover:opacity-100 ${logo.bundled ? "dark:invert" : ""}`}
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-xs font-bold">
                      {pick(b.name, lang).slice(0, 1)}
                    </span>
                  )}
                  <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
                    {pick(b.name, lang)}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    ),

    location: pick(doc.business.address, lang) && (
      <section key="location" className="mx-auto max-w-7xl px-4 py-16 lg:px-8" aria-labelledby="home-location">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-card p-8 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <MapPin className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 id="home-location" className="text-xl font-black uppercase tracking-tight">{t.ctaTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(doc.business.address, lang)}</p>
              {pick(doc.business.hours, lang) && (
                <p className="mt-1 text-sm text-muted-foreground">{pick(doc.business.hours, lang)}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {doc.business.mapUrl && (
              <a
                href={doc.business.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border px-6 text-sm font-semibold transition hover:border-primary/60"
              >
                {dict.contactPage.visitUs}
              </a>
            )}
            <TrackLink
              href={lp("/contact")}
              label="Get a Quote — location"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {dict.cta.getQuote} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </TrackLink>
          </div>
        </div>
      </section>
    ),
  }

  return (
    <>
      {!heroVisible && <h1 className="sr-only">{pick(home.title, lang)}</h1>}
      {home.sections.filter((s) => s.visible).map((s) => sections[s.key] || null)}
    </>
  )
}
