"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { track } from "@/lib/site-track"

/** Fires a page_view event on every route change across the public site. */
export function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    track("page_view")
  }, [pathname])
  return null
}
