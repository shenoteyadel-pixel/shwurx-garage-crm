import Link from "next/link"
import { MapPin, Phone, Mail, Instagram, Facebook, Youtube, Linkedin } from "lucide-react"
import type { PublicSiteInfo } from "@/lib/site-info"
import { getServerI18n } from "@/lib/i18n/server"

// Public legal identifiers (shown on the storefront footer, as on business cards).
const LEGAL_NAME = "SHENOTEY ESKANDER AUTOMOTIVE CENTER"
const TRADE_LICENSE = "1033544"
const TRN = "10044045860003"

const QUICK_LINKS = [
  { href: "/", key: "home" as const },
  { href: "/services", key: "services" as const },
  { href: "/#brands", key: "brands" as const },
  { href: "/about", key: "about" as const },
  { href: "/contact", key: "contact" as const },
]

const SOCIALS = [
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Facebook, label: "Facebook", href: "#" },
  { icon: Youtube, label: "YouTube", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
]

export async function SiteFooter({ info }: { info: PublicSiteInfo }) {
  const { dict } = await getServerI18n()
  const t = dict.footer
  const year = new Date().getFullYear()
  const phone = info.phone || "+971 4 123 4567"
  const email = info.email || "info@shwurxgarage.ae"
  const address = info.address || "Dubai, UAE"

  return (
    <footer className="border-t border-border bg-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {/* Brand */}
        <div>
          <Link href="/" className="flex flex-col leading-none" dir="ltr">
            <span className="text-2xl font-black tracking-tight">
              SHWUR<span className="text-primary">X</span>
            </span>
            <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              ONE GARAGE. <span className="text-primary">LIMITLESS SOLUTIONS.</span>
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            {t.blurb}
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">{t.quickLinks}</h3>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition hover:text-foreground">
                  {dict.nav[l.key]}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Our Services */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">{t.ourServices}</h3>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
            {t.serviceLinks.map((s) => (
              <li key={s}>
                <Link href="/services" className="transition hover:text-foreground">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide">{t.contactUs}</h3>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{address}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-primary" />
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="transition hover:text-foreground" dir="ltr">
                {phone}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <a href={`mailto:${email}`} className="transition hover:text-foreground" dir="ltr">
                {email}
              </a>
            </li>
          </ul>
          <div className="mt-4 flex items-center gap-2">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Legal bar */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-muted-foreground lg:flex-row lg:items-center lg:px-8">
          <span className="flex items-center gap-3">
            © {year} {info.companyName}. {t.rights}
            <Link href="/crm" className="text-muted-foreground/70 transition hover:text-foreground">
              {t.staffLogin}
            </Link>
          </span>
          <span className="text-muted-foreground/80" dir="ltr">
            {LEGAL_NAME} &nbsp;|&nbsp; {t.tradeLicense}: {TRADE_LICENSE} &nbsp;|&nbsp; {t.trn}: {TRN}
          </span>
        </div>
      </div>
    </footer>
  )
}
