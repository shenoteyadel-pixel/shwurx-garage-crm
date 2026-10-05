import type React from "react"
import type { Metadata } from "next"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { TrackingGate } from "@/components/site/tracking-gate"
import { consentNeeded } from "@/lib/website/consent-needed"
import { PreviewBar } from "@/components/site/preview-bar"
import { SiteTracking } from "@/components/site-tracking"
import { localePath, pick, siteContext } from "@/lib/website/render"
import { effectiveAnalytics, siteAnalytics } from "@/lib/website/analytics-server"
import { normalizeRuntime } from "@/lib/website/analytics"
import { ConsentBanner } from "@/components/site/consent-banner"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { doc } = await siteContext()
    const token = (await effectiveAnalytics(doc)).searchConsoleToken
    return token ? { verification: { google: token } } : {}
  } catch {
    return {}
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { doc, lang, preview, previewLabel } = await siteContext()
  // Master switch, preview, non-production deployments and the host allowlist
  // are all applied in one place.
  const tags = normalizeRuntime(await siteAnalytics(doc, preview).catch((e) => {
      console.error("site analytics unavailable; tags disabled for this render", e)
      return null
    }),
  )
  const ar = lang === "ar"

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground" lang={lang} dir={ar ? "rtl" : "ltr"}>
      <SiteTracking tags={tags} />
      <TrackingGate tags={tags} />
      {consentNeeded(tags) && <ConsentBanner lang={lang} privacyHref={localePath(lang, "/privacy")} />}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {ar ? "انتقل إلى المحتوى" : "Skip to content"}
      </a>
      {preview && <PreviewBar label={previewLabel ?? "Draft"} />}
      <SiteHeader
        nav={doc.nav.header.filter((l) => l.visible).map((l) => ({ href: localePath(lang, l.href), label: pick(l.label, lang) }))}
        homeHref={localePath(lang, "/")}
        enquireHref={localePath(lang, "/contact#enquire")}
        enquireLabel={ar ? "أرسل استفساراً" : "Send an enquiry"}
        trackHref="/track"
        trackLabel={ar ? "تتبع سيارتك" : "Track your car"}
        menuLabel={ar ? "القائمة" : "Menu"}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter doc={doc} lang={lang} />
    </div>
  )
}
