"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Search, Menu, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { track } from "@/lib/site-track"
import type { PublicSiteInfo } from "@/lib/site-info"

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/#brands", label: "Brands" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
]

function Wordmark() {
  return (
    <span className="flex flex-col leading-none">
      <span className="text-xl font-black tracking-tight">
        SHWUR<span className="text-primary">X</span>
      </span>
      <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        ONE GARAGE. <span className="text-primary">LIMITLESS SOLUTIONS.</span>
      </span>
    </span>
  )
}

export function SiteHeader({ info: _info }: { info: PublicSiteInfo }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4 lg:px-8">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : l.href.startsWith("/#") ? false : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
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

        <div className="ml-auto flex items-center gap-2 lg:ml-4">
          <Link
            href="/track"
            aria-label="Track your car"
            onClick={() => track("cta_click", { label: "Search/Track — header" })}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/appointment"
            onClick={() => track("cta_click", { label: "Book a Service — header" })}
            className="hidden h-10 items-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent sm:inline-flex"
          >
            Book a Service
          </Link>
          <Link
            href="/contact"
            onClick={() => track("cta_click", { label: "Get a Quote — header" })}
            className="hidden h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 sm:inline-flex"
          >
            Get a Quote
          </Link>
          <button
            className="text-muted-foreground lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                href="/appointment"
                onClick={() => {
                  setOpen(false)
                  track("cta_click", { label: "Book a Service — mobile" })
                }}
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground"
              >
                Book a Service
              </Link>
              <Link
                href="/contact"
                onClick={() => {
                  setOpen(false)
                  track("cta_click", { label: "Get a Quote — mobile" })
                }}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Get a Quote <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
