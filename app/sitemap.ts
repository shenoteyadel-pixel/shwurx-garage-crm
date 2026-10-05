import type { MetadataRoute } from "next"
import { getPublishedDocument } from "@/lib/website/store"
import { isTeamPagePublic } from "@/lib/website/normalize"
import { SITE_URL, localePath } from "@/lib/website/render"
import { listPublishedArticles } from "@/lib/blog"
import { liveLocales } from "@/lib/article-model"

export const revalidate = 3600

/** Published content only — drafts and noindex pages are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const doc = await getPublishedDocument()
  const now = new Date()
  const paths: string[] = ["/", "/brands", "/services", "/about", "/contact", "/blog", "/privacy"]

  if (isTeamPagePublic(doc) && !doc.pages.team.seo.noindex) paths.push("/team")
  for (const b of doc.brands) if (b.visible && !b.seo.noindex) paths.push(`/brands/${b.slug}`)
  for (const s of doc.services) if (s.visible && !s.seo.noindex) paths.push(`/services/${s.slug}`)
  for (const p of doc.pages.custom) if (p.visible && !p.seo.noindex) paths.push(`/pages/${p.slug}`)

  // Articles list only the locales that are live; a one-language article has no false alternate.
  const articles: MetadataRoute.Sitemap = (await listPublishedArticles()).flatMap((a) => {
    const live = liveLocales(a)
    const url = (l: "en" | "ar") => `${SITE_URL}${localePath(l, `/blog/${a.slug}`)}`
    const languages = Object.fromEntries(live.map((l) => [l, url(l)]))
    return live.map((l) => ({
      url: url(l),
      lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: live.length > 1 ? { languages } : undefined,
    }))
  })

  return [...paths.map((p) => ({
    url: `${SITE_URL}${localePath("en", p)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p === "/" ? 1 : p.split("/").length > 2 ? 0.7 : 0.8,
    alternates: {
      languages: { en: `${SITE_URL}${localePath("en", p)}`, ar: `${SITE_URL}${localePath("ar", p)}` },
    },
  })), ...articles]
}
