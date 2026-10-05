"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { captureAttribution, emitClick, track } from "@/lib/site-track"
import { isPublicSitePath } from "@/lib/website/paths"
import type { RuntimeTags } from "@/lib/website/analytics"

/** Which intent a link expresses, or null for an ordinary link. */
export function clickKind(href: string): "phone_click" | "whatsapp_click" | null {
  const h = href.trim().toLowerCase()
  if (h.startsWith("tel:")) return "phone_click"
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\//.test(h) || h.startsWith("whatsapp:")) {
    return "whatsapp_click"
  }
  return null
}

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
export function TrackingGate({ tags }: { tags: RuntimeTags }) {
  const { firstParty, thirdParty, mode } = tags
  // Assigned during render so child effects (which run first) already see it.
  if (typeof window !== "undefined") {
    window.__shwurxTrack = firstParty
    window.__shwurxThirdParty = thirdParty
    window.__shwurxTagMode = thirdParty ? mode : "none"
    window.__shwurxTags = { events: tags.events, adsId: tags.adsId, adsLabels: tags.adsLabels }
    // Meta-only setups count too: any loaded tag forces the private-route reload.
    if (thirdParty) window.__shwurxTagsLoaded = true
  }
  const pathname = usePathname()

  useEffect(() => {
    if (!firstParty) return
    captureAttribution()
    track("page_view")
  }, [pathname, firstParty])

  useEffect(() => {
    if (!firstParty) return
    // One delegated listener so every call/WhatsApp link counts exactly once,
    // including header, footer and CMS-authored links.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      const kind = clickKind(a.getAttribute("href") ?? "")
      if (!kind) return
      const context = a.closest("[data-track-context]")?.getAttribute("data-track-context") || window.location.pathname
      emitClick(kind, context.slice(0, 80))
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [firstParty])

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
