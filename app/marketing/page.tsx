import { redirect } from "next/navigation"
import { getSettings } from "@/lib/settings"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { WebsiteControlCenter } from "@/components/website-control-center"
import { getDictionary } from "@/lib/i18n/dictionaries"
import { getSiteContentOverrides } from "@/lib/site-content"
import { listAllPosts } from "@/lib/blog"
import { SITE_CONTENT_GROUPS, SITE_IMAGE_SLOTS, readPath } from "@/lib/site-content-fields"

export const metadata = { title: "Website Control Center · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function MarketingPage() {
  const [settings, user, overrides, posts] = await Promise.all([
    getSettings(),
    getShellUser(),
    getSiteContentOverrides(),
    listAllPosts(),
  ])
  const perms = new Set(user.permissions ?? [])
  if (!perms.has("marketing.view") && !perms.has("marketing.manage") && !perms.has("website.manage")) redirect("/")
  // Two independent concerns, kept cleanly separated:
  //  - website.manage  → edit site text, images and blog
  //  - marketing.view  → see tracking/analytics; marketing.manage → edit it
  const canManageWebsite = perms.has("website.manage")
  const canManageMarketing = perms.has("marketing.manage")
  const canViewMarketing = perms.has("marketing.view") || perms.has("marketing.manage")

  const enDict = getDictionary("en")
  const arDict = getDictionary("ar")

  // Flatten the curated field paths into { path: value } maps for the editor:
  // defaults drive the placeholders, overrides drive the current input values.
  const paths = SITE_CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => f.path))
  const fieldDefaults = {
    en: Object.fromEntries(paths.map((p) => [p, readPath(enDict, p)])),
    ar: Object.fromEntries(paths.map((p) => [p, readPath(arDict, p)])),
  }
  const fieldValues = {
    en: Object.fromEntries(paths.map((p) => [p, readPath(overrides.en, p)])),
    ar: Object.fromEntries(paths.map((p) => [p, readPath(overrides.ar, p)])),
  }

  // Only pass through image overrides for the slots we expose.
  const images: Record<string, string> = {}
  for (const slot of SITE_IMAGE_SLOTS) {
    const v = overrides.images?.[slot.key]
    if (typeof v === "string" && v) images[slot.key] = v
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Website Control Center</h1>
          <p className="text-sm text-muted-foreground">
            Full control over your public website — edit any text, swap images, run a blog, and connect analytics &amp;
            ad tracking. No code or developer needed. Your marketing agency can be given access to this page only.
          </p>
        </div>
        <WebsiteControlCenter
          settings={settings}
          canManageWebsite={canManageWebsite}
          canManageMarketing={canManageMarketing}
          canViewMarketing={canViewMarketing}
          fieldValues={fieldValues}
          fieldDefaults={fieldDefaults}
          images={images}
          posts={posts}
        />
      </div>
    </AppShell>
  )
}
