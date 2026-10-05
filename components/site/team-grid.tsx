import Image from "next/image"
import type { Lang, MediaAsset } from "@/lib/website/types"

export interface TeamCard {
  id: string
  name: string
  jobTitle: string
  bio: string
  department: string
  photo: { url: string; alt: string; focalX: number; focalY: number } | null
  draft: boolean
  /** photo is generated concept art (preview only) */
  illustrative?: boolean
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
}

export function TeamGrid({
  cards,
  draftLabel,
  emptyName,
  illustrativeLabel,
}: {
  cards: TeamCard[]
  draftLabel: string
  emptyName: string
  illustrativeLabel: string
}) {
  return (
    <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {cards.map((c) => (
        <li key={c.id} className={c.draft ? "opacity-80" : undefined}>
          <article className="flex flex-col">
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted">
              {c.photo ? (
                <Image
                  src={c.photo.url || "/placeholder.svg"}
                  alt={c.photo.alt}
                  fill
                  loading="lazy"
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:hover:scale-[1.03]"
                  style={{ objectPosition: `${c.photo.focalX}% ${c.photo.focalY}%` }}
                />
              ) : (
                <div className="flex h-full items-center justify-center" aria-hidden="true">
                  <span className="text-4xl font-bold uppercase tracking-tight text-muted-foreground">{initials(c.name) || "?"}</span>
                </div>
              )}
              <div className="absolute start-2 top-2 flex flex-wrap gap-1">
                {c.draft && <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">{draftLabel}</span>}
                {c.illustrative && c.photo && (
                  <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">{illustrativeLabel}</span>
                )}
              </div>
            </div>
            <h2 className="mt-4 text-pretty text-lg font-bold leading-snug tracking-tight">{c.name || emptyName}</h2>
            {c.jobTitle && <p className="mt-0.5 text-sm font-medium text-primary">{c.jobTitle}</p>}
            {c.department && <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{c.department}</p>}
            {c.bio && <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{c.bio}</p>}
          </article>
        </li>
      ))}
    </ul>
  )
}

/** Anonymous labelled strip of AI portraits: no names, titles or Person markup. */
export function IllustrativeStrip({ photos, lang, compact = false }: { photos: MediaAsset[]; lang: Lang; compact?: boolean }) {
  const ar = lang === "ar"
  return (
    <figure className={compact ? "mt-8" : "mt-14"}>
      <ul className={`grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-6 lg:grid-cols-9"}`}>
        {photos.map((p) => (
          <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
            <Image
              src={p.url || "/placeholder.svg"}
              alt={ar ? p.alt.ar || p.alt.en : p.alt.en}
              width={p.width ?? 256}
              height={p.height ?? 341}
              loading="lazy"
              sizes="(min-width: 1024px) 11vw, (min-width: 640px) 16vw, 33vw"
              className="h-full w-full object-cover"
              style={{ objectPosition: `${p.focalX}% ${p.focalY}%` }}
            />
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        {ar
          ? "الملفات التعريفية لأفراد الفريق قريباً."
          : "Team profiles coming soon."}
      </figcaption>
    </figure>
  )
}
