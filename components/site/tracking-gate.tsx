"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { captureAttribution, track } from "@/lib/site-track"
import { isPublicSitePath } from "@/lib/website/paths"

/**
 * Applies the website master switch and consent to first-party events, sets
 * which third-party provider owns conversions, and records attribution.
 *
 * Mounted only inside the public website layout. When the visitor client-side
 * navigates from the website to a CRM, portal or token route, this unmounts:
 * events are switched off and — if third-party tags were loaded — the browser
 * performs a full page load so no provider script (or its automatic page
 * tracking) survives onto that surface.
 */
export function TrackingGate({
  firstParty,
  thirdParty,
  tagMode,
  metaPixel = false,
}: {
  firstParty: boolean
  thirdParty: boolean
  tagMode: "gtm" | "ga4" | "none"
  /** a Meta Pixel is injected; it is a loaded tag even when no GTM/GA4 is set */
  metaPixel?: boolean
}) {
  // Assigned during render so child effects (which run first) already see it.
  if (typeof window !== "undefined") {
    window.__shwurxTrack = firstParty
    window.__shwurxThirdParty = thirdParty
    window.__shwurxTagMode = thirdParty ? tagMode : "none"
    if (thirdParty && (tagMode !== "none" || metaPixel)) window.__shwurxTagsLoaded = true
  }
  const pathname = usePathname()

  useEffect(() => {
    if (!firstParty) return
    captureAttribution()
    track("page_view")
  }, [pathname, firstParty])

  useEffect(() => {
    return () => {
      window.__shwurxTrack = false
      window.__shwurxThirdParty = false
      window.__shwurxTagMode = "none"
      // Wait for the router to commit the new URL, then enforce the boundary.
      window.setTimeout(() => {
        if (window.__shwurxTagsLoaded && !isPublicSitePath(window.location.pathname)) {
          window.location.reload()
        }
      }, 0)
    }
  }, [])

  return null
}
