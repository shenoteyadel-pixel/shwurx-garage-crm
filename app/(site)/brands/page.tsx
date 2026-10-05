import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { buildMetadata, localePath, pick, publicMedia, siteContext } from "@/lib/website/render"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang } = await siteContext()
  return buildMetadata(doc, lang, "/brands", doc.pages.brandsIndex.seo)
}

export default async function BrandsIndexPage() {
  const { doc, lang } = await siteContext()
  const page = doc.pages.brandsIndex
  const brands = doc.brands.filter((b) => b.visible)

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{pick(page.intro, lang)}</p>
      </div>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => {
          const logo = publicMedia(doc, b.logoId)
          return (
            <li key={b.id}>
              <Link
                href={localePath(lang, `/brands/${b.slug}`)}
                className="flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/60"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  {logo ? (
                    <Image src={logo.url || "/placeholder.svg"} alt="" width={32} height={32} className="h-8 w-8 object-contain dark:invert" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground" aria-hidden>
                      {b.name.en.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{pick(b.name, lang)}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {b.models.slice(0, 3).map((m) => m.name).join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
