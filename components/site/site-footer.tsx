import Link from "next/link"
import { MapPin, Phone, Mail } from "lucide-react"
import { localePath, pick, publicMedia, visibleNav } from "@/lib/website/render"
import type { Lang, WebsiteDocument } from "@/lib/website/types"

// Public legal identifiers (shown on the storefront footer, as on business cards).
// Kept separate from the editable public identity; managed in CRM settings.
const LEGAL_NAME = "SHENOTEY ESKANDER AUTOMOTIVE CENTER"
const TRADE_LICENSE = "1033544"
const TRN = "10044045860003"

const T = {
  en: { quick: "Explore", services: "Services", contact: "Contact", rights: "All rights reserved.", staff: "Staff login", tl: "Trade License", trn: "TRN" },
  ar: { quick: "استكشف", services: "الخدمات", contact: "تواصل معنا", rights: "جميع الحقوق محفوظة.", staff: "دخول الموظفين", tl: "الرخصة التجارية", trn: "الرقم الضريبي" },
}

export function SiteFooter({ doc, lang }: { doc: WebsiteDocument; lang: Lang }) {
  const t = T[lang]
  const b = doc.business
  const logo = publicMedia(doc, b.logoId)
  const year = new Date().getFullYear()
  const socials = b.socials.filter((s) => /^https:\/\//.test(s.url))

  return (
    <footer className="border-t border-border bg-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Link href={localePath(lang, "/")} className="flex flex-col leading-none" dir="ltr" aria-label={pick(b.name, lang) || "SHWURX"}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.url} alt={pick(logo.alt, lang) || pick(b.name, lang)} className="h-12 w-auto max-w-48 object-contain" />
            ) : (
              <>
                <span className="text-2xl font-black tracking-tight">
                  SHWUR<span className="text-primary">X</span>
                </span>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  ONE GARAGE. <span className="text-primary">LIMITLESS SOLUTIONS.</span>
                </span>
              </>
            )}
          </Link>
          <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {pick(doc.seo.defaultDescription, lang)}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.quick}</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
            {visibleNav(doc, doc.nav.footer).map((l) => (
                <li key={l.id}>
                  <Link href={localePath(lang, l.href)} className="transition hover:text-foreground">
                    {pick(l.label, lang)}
                  </Link>
                </li>
              ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.services}</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
            {doc.services
              .filter((s) => s.visible)
              .map((s) => (
                <li key={s.id}>
                  <Link href={localePath(lang, `/services/${s.slug}`)} className="transition hover:text-foreground">
                    {pick(s.name, lang)}
                  </Link>
                </li>
              ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.contact}</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
            {pick(b.address, lang) && (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{pick(b.address, lang)}</span>
              </li>
            )}
            {b.phone && (
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="transition hover:text-foreground" dir="ltr">
                  {b.phone}
                </a>
              </li>
            )}
            {b.email && (
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`mailto:${b.email}`} className="transition hover:text-foreground" dir="ltr">
                  {b.email}
                </a>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {socials.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-muted-foreground lg:flex-row lg:items-center lg:px-8">
          <span className="flex items-center gap-3">
            © {year} {pick(b.name, lang)}. {t.rights}
            <Link href="/crm" className="text-muted-foreground/70 transition hover:text-foreground">
              {t.staff}
            </Link>
          </span>
          <span className="text-muted-foreground/80" dir="ltr">
            {LEGAL_NAME} &nbsp;|&nbsp; {t.tl}: {TRADE_LICENSE} &nbsp;|&nbsp; {t.trn}: {TRN}
          </span>
        </div>
      </div>
    </footer>
  )
}
