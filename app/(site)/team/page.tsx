import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { buildMetadata, pick, publicMedia, siteContext } from "@/lib/website/render"
import { isPublicTeamMember, isTeamPagePublic } from "@/lib/website/normalize"
import { TeamGrid, type TeamCard } from "@/components/site/team-grid"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  return buildMetadata(doc, lang, "/team", doc.pages.team.seo, preview)
}

export default async function TeamPage() {
  const { doc, lang, preview } = await siteContext()
  const page = doc.pages.team
  // Live: only complete, visible members. Draft preview also shows unfinished slots, clearly marked.
  if (!preview && !isTeamPagePublic(doc)) notFound()

  const members = page.members.filter((m) => !m.archived && (preview || isPublicTeamMember(m)))
  const cards: TeamCard[] = members.map((m) => {
    const photo = publicMedia(doc, m.photoId)
    return {
      id: m.id,
      name: pick(m.name, lang),
      jobTitle: pick(m.jobTitle, lang),
      bio: pick(m.bio, lang),
      department: pick(m.department, lang),
      photo: photo ? { url: photo.url, alt: pick(photo.alt, lang) || pick(m.name, lang), focalX: photo.focalX, focalY: photo.focalY } : null,
      draft: !isPublicTeamMember(m),
    }
  })
  const intro = pick(page.intro, lang).split(/\n{2,}/).filter(Boolean)
  const ar = lang === "ar"

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
      <header className="max-w-3xl">
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
        {intro.map((p, i) => (
          <p key={i} className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{p}</p>
        ))}
      </header>
      {preview && !page.visible && (
        <p className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {ar ? "صفحة الفريق مخفية حالياً ولن تظهر للزوار." : "The Team page is switched off and is not shown to visitors."}
        </p>
      )}
      <TeamGrid cards={cards} draftLabel={ar ? "مسودة — غير منشور" : "Draft — not public"} emptyName={ar ? "عضو بدون اسم" : "Unnamed member"} />
    </div>
  )
}
