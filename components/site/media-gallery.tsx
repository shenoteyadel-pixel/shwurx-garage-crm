import Image from "next/image"
import { pick, publicMedia } from "@/lib/website/render"
import type { Lang, WebsiteDocument } from "@/lib/website/types"

/** Resolves ids to approved, public-safe media only. */
export function resolveGallery(doc: WebsiteDocument, ids: string[]) {
  return ids.map((id) => publicMedia(doc, id)).filter((m): m is NonNullable<typeof m> => !!m)
}

export function MediaGallery({
  doc,
  lang,
  ids,
  compact = false,
}: {
  doc: WebsiteDocument
  lang: Lang
  ids: string[]
  compact?: boolean
}) {
  const items = resolveGallery(doc, ids)
  if (items.length === 0) return null
  return (
    <div className={compact ? "mt-4 grid grid-cols-2 gap-2" : "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
      {items.map((g) => (
        <figure key={g.id} className="flex flex-col gap-1.5">
          <Image
            src={g.url || "/placeholder.svg"}
            alt={pick(g.alt, lang)}
            width={g.width ?? 800}
            height={g.height ?? 600}
            sizes={compact ? "(min-width: 768px) 25vw, 50vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
            className="aspect-[4/3] w-full rounded-xl object-cover"
            style={{ objectPosition: `${g.focalX}% ${g.focalY}%` }}
          />
          {!compact && pick(g.caption, lang) && (
            <figcaption className="text-xs leading-relaxed text-muted-foreground">{pick(g.caption, lang)}</figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}
