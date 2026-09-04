"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { track } from "@/lib/site-track"

/**
 * A Next.js Link that fires a best-effort `cta_click` tracking event before
 * navigating. Lets server-rendered marketing sections keep analytics without
 * becoming client components themselves.
 */
export function TrackLink({
  href,
  label,
  className,
  children,
  ariaLabel,
}: {
  href: string
  label: string
  className?: string
  children: ReactNode
  ariaLabel?: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onClick={() => track("cta_click", { label })}
      className={className}
    >
      {children}
    </Link>
  )
}
