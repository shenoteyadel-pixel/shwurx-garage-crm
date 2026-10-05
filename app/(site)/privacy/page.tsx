import type { Metadata } from "next"
import { buildMetadata, pick, siteContext } from "@/lib/website/render"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang } = await siteContext()
  return buildMetadata(doc, lang, "/privacy", doc.pages.privacy.seo)
}

export default async function PrivacyPage() {
  const { doc, lang } = await siteContext()
  const p = doc.pages.privacy
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <h1 className="text-balance text-4xl font-bold tracking-tight">{pick(p.title, lang)}</h1>
      <div className="mt-6 whitespace-pre-line text-pretty leading-relaxed text-muted-foreground">{pick(p.body, lang)}</div>
    </div>
  )
}
