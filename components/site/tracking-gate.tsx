"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { captureAttribution, track } from "@/lib/site-track"

/**
 * Applies the website master switch to first-party events and records
 * first-touch attribution. Mounted only inside the public website layout, so
 * CRM, auth, portal and tokenized customer routes never emit website events.
 */
export function TrackingGate({ firstParty, thirdParty }: { firstParty: boolean; thirdParty: boolean }) {
  // Assigned during render so child effects (which run first) already see it.
  if (typeof window !== "undefined") {
    window.__shwurxTrack = firstParty
    window.__shwurxThirdParty = thirdParty
  }
  const pathname = usePathname()
  useEffect(() => {
    if (!firstParty) return
    captureAttribution()
    track("page_view")
  }, [pathname, firstParty])
  return null
}
