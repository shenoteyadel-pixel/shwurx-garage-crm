"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Search, Menu, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { track } from "@/lib/site-track"
import { stripLocale } from "@/lib/website/paths"
import { SiteControls, SiteControlsStacked } from "@/components/site/site-controls"
import { BrandLogo } from "@/components/brand-logo"

export interface HeaderLink {
  href: string
  label: string
}

export function SiteHeader({
  nav,
  homeHref,
  enquireHref,
  enquireLabel,
  trackHref,
  trackLabel,
  menuLabel,
  logo = null,
}: {
  logo?: { url: string; alt: string } | null
  nav: HeaderLink[]
  homeHref: string
  enquireHref: string
  enquireLabel: string
  trackHref: string
  trackLabel: string
  menuLabel: string
}) {
  const pathname = usePathname()
  const current = stripLocale(pathname).path
  const [open, setOpen] = useState(false)
  const isActive = (href: string) => {
    const p = stripLocale(href).path
    return p === "/" ? current === "/" : current === p || current.startsWith(p + "/")
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4 lg:px-8">
        <Link href={homeHref} className="shrink-0" aria-label="SHWURX Auto Service Center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt={logo.alt} className="h-14 w-auto max-w-52 object-contain" />
          ) : (
            <BrandLogo className="h-14 max-w-52" />
          )}
        </Link>

        <nav aria-label="Main" className="ms-auto hidden items-center gap-1 lg:flex">
          {nav.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-2 text-sm font-medium transition",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            )
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-4">
          <SiteControls className="hidden md:flex" />
          <Link
            href={trackHref}
            aria-label={trackLabel}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href={enquireHref}
            onClick={() => track("cta_click", { label: "enquire_header" })}
            className="hidden h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 sm:inline-flex"
          >
            {enquireLabel}
          </Link>
          <button
            type="button"
            className="text-muted-foreground lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={menuLabel}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background lg:hidden">
          <nav aria-label="Main" className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {nav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(l.href) ? "page" : undefined}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={enquireHref}
              onClick={() => {
                setOpen(false)
                track("cta_click", { label: "enquire_mobile" })
              }}
              className="mt-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {enquireLabel} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <div className="mt-4 border-t border-border pt-4">
              <SiteControlsStacked />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
