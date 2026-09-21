import type { Metadata } from "next"
import { Phone, Mail, MapPin, MessageCircle, Clock, ArrowUpRight } from "lucide-react"
import { ContactForm } from "@/components/site/contact-form"
import { getPublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"

export const metadata: Metadata = {
  title: "Contact — SHWURX Auto Service Center",
  description: "Get in touch with SHWURX Auto Service Center. Call, email, or message us on WhatsApp.",
}

export default async function ContactPage() {
  const [info, { dict }] = await Promise.all([getPublicSiteInfo(), getServerI18n()])
  const t = dict.contactPage
  const waNumber = (info.whatsapp || "").replace(/[^\d]/g, "")
  const mapSrc = info.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(info.address)}&output=embed`
    : null

  return (
    <div className="relative">
      {/* Header band */}
      <section className="relative overflow-hidden border-b border-border bg-card/40">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_80%_at_15%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            {t.kicker}
          </span>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">{t.title}</h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            {t.intro}
          </p>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          {/* Info panel */}
          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-black/5">
              <ul className="divide-y divide-border">
                {info.phone && (
                  <li>
                    <a
                      href={`tel:${info.phone.replace(/\s+/g, "")}`}
                      className="group flex items-center gap-4 px-6 py-5 transition hover:bg-accent/40"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Phone className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs uppercase tracking-wide text-muted-foreground">{t.callUs}</span>
                        <span className="block truncate text-base font-semibold" dir="ltr">
                          {info.phone}
                        </span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </a>
                  </li>
                )}

                {info.email && (
                  <li>
                    <a
                      href={`mailto:${info.email}`}
                      className="group flex items-center gap-4 px-6 py-5 transition hover:bg-accent/40"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Mail className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs uppercase tracking-wide text-muted-foreground">{t.email}</span>
                        <span className="block truncate text-base font-semibold" dir="ltr">
                          {info.email}
                        </span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </a>
                  </li>
                )}

                {info.address && (
                  <li className="flex items-start gap-4 px-6 py-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs uppercase tracking-wide text-muted-foreground">{t.visitUs}</span>
                      <span className="block text-sm font-semibold leading-relaxed">{info.address}</span>
                    </span>
                  </li>
                )}
              </ul>
            </div>

            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-5 transition hover:bg-emerald-500/15"
              >
                <span className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-emerald-400/80">{t.whatsapp}</span>
                    <span className="block text-base font-semibold text-emerald-300">{t.whatsappCta}</span>
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-400" />
              </a>
            )}

            <div className="flex items-start gap-4 rounded-2xl border border-border bg-card px-6 py-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                <Clock className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{t.responseTitle}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{t.responseBody}</span>
              </span>
            </div>

            {mapSrc && (
              <div className="overflow-hidden rounded-3xl border border-border bg-card">
                <iframe
                  src={mapSrc}
                  title={t.mapTitle}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-56 w-full grayscale-[35%] transition [color-scheme:normal] hover:grayscale-0"
                />
              </div>
            )}
          </aside>

          <ContactForm heading={t.formHeading} sub={t.formSub} />
        </div>
      </div>
    </div>
  )
}
