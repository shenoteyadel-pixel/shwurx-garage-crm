"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import {
  cancelPendingConversions,
  captureAttribution,
  emitClick,
  flushPageView,
  notePageView,
  installGtmConsentBridge,
  pageContext,
  persistAttributionAfterConsent,
} from "@/lib/site-track"
import { effectiveConsent, subscribeConsent } from "@/lib/consent"
import { consentNeeded } from "@/lib/website/consent-needed"
import { isPublicSitePath } from "@/lib/website/paths"
import { normalizeRuntime, type RuntimeTags } from "@/lib/website/analytics"

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
export function TrackingGate({ tags: input }: { tags?: RuntimeTags | null }) {
  const tags = normalizeRuntime(input)
  const { firstParty, thirdParty, mode } = tags
  // Assigned during render so child effects (which run first) already see it.
  if (typeof window !== "undefined") {
    window.__shwurxTrack = firstParty
    window.__shwurxThirdParty = thirdParty
    window.__shwurxTagMode = thirdParty ? mode : "none"
    window.__shwurxConsentNeeded = consentNeeded(tags)
    window.__shwurxTags = {
      events: tags.events,
      ga4Id: tags.ga4Id,
      adsId: tags.adsId,
      adsLabels: tags.adsLabels,
      retentionDays: tags.retentionDays,
      publicSlugs: tags.publicSlugs,
    }
    window.__shwurxPublicRuntimeEligible = () => window.__shwurxTrack === true && window.__shwurxThirdParty === true && isPublicSitePath(window.location.pathname)
    window.__shwurxSafePageSettings = () => {
      const context = pageContext(window.location.pathname)
      return { page_location: "https://www.swurxauto.com" + context.page_path, page_referrer: "", page_title: `SHWURX | ${context.page_type}` }
    }
    installGtmConsentBridge()
    // Meta-only setups count too: any loaded tag forces the private-route reload.
    if (thirdParty) window.__shwurxTagsLoaded = true
  }
  const pathname = usePathname()

  useEffect(() => {
    if (!firstParty) return
    captureAttribution()
    notePageView(pathname)
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
    return subscribeConsent(() => {
      const c = effectiveConsent()
      if (c.ads) persistAttributionAfterConsent()
      if (c.analytics) flushPageView()
      if (!c.analytics && !c.ads) cancelPendingConversions("consent_withdrawn")
    })
  }, [])

  useEffect(() => {
    return () => {
      window.__shwurxTrack = false
      window.__shwurxConsentNeeded = undefined
      window.__shwurxThirdParty = false
      window.__shwurxTagMode = "none"
      window.__shwurxGtmConsentReady = false
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
