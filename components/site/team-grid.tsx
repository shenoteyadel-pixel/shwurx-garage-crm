import Image from "next/image"

export interface TeamCard {
  id: string
  name: string
  jobTitle: string
  bio: string
  department: string
  photo: { url: string; alt: string; focalX: number; focalY: number } | null
  draft: boolean
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
}

export function TeamGrid({ cards, draftLabel, emptyName }: { cards: TeamCard[]; draftLabel: string; emptyName: string }) {
  return (
    <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {cards.map((c) => (
        <li key={c.id} className={c.draft ? "opacity-60" : undefined}>
          <article className="flex flex-col">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted">
              {c.photo ? (
                <Image
                  src={c.photo.url}
                  alt={c.photo.alt}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:hover:scale-[1.03]"
                  style={{ objectPosition: `${c.photo.focalX}% ${c.photo.focalY}%` }}
                />
              ) : (
                <div className="flex h-full items-center justify-center" aria-hidden="true">
                  <span className="text-4xl font-bold uppercase tracking-tight text-muted-foreground">{initials(c.name) || "?"}</span>
                </div>
              )}
              {c.draft && (
                <span className="absolute start-2 top-2 rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">{draftLabel}</span>
              )}
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
