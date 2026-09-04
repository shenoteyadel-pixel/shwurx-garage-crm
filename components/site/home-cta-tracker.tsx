"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { track } from "@/lib/site-track"

export function HomeCtaTracker() {
  return (
    <>
      <Link
        href="/appointment"
        onClick={() => track("cta_click", { label: "Book — hero" })}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground hover:opacity-90"
      >
        Book Appointment <ArrowRight className="h-5 w-5" />
      </Link>
      <Link
        href="/track"
        onClick={() => track("cta_click", { label: "Track — hero" })}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-7 text-base font-semibold text-foreground hover:bg-accent"
      >
        Track Your Car
      </Link>
    </>
  )
}
