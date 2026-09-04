import type React from "react"
import { getPublicSiteInfo } from "@/lib/site-info"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { PageViewTracker } from "@/components/site/page-view-tracker"

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const info = await getPublicSiteInfo()
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <PageViewTracker />
      <SiteHeader info={info} />
      <main className="flex-1">{children}</main>
      <SiteFooter info={info} />
    </div>
  )
}
