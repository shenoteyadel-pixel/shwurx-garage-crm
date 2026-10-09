import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { buildMetadata, localePath, pick, publicMedia, siteContext } from "@/lib/website/render"
import { illustrativeStripMembers, isIllustrativeMedia, isPublicTeamMember, isTeamPagePublic } from "@/lib/website/normalize"
import { publicSiteInfo } from "@/lib/site-info"
import { IllustrativeStrip, TeamGrid, type TeamCard } from "@/components/site/team-grid"
import { ContactActions } from "@/components/site/contact-actions"

export async function generateMetadata(): Promise<Metadata> {
  const { doc, lang, preview } = await siteContext()
  return buildMetadata(doc, lang, "/team", doc.pages.team.seo, preview)
}

export default async function TeamPage() {
  const { doc, lang, preview } = await siteContext()
  const page = doc.pages.team
  // The page itself is gated only by its switch. Members are gated one by one:
  // live shows complete visible members; draft preview also shows unfinished slots, marked as drafts.
  if (!preview && !isTeamPagePublic(doc)) notFound()

  const members = page.members.filter((m) => !m.archived && (preview || isPublicTeamMember(m)))
  // Unfilled slots with AI portraits appear live only as an anonymous, labelled strip.
  const illustrative = preview
    ? []
    : illustrativeStripMembers(doc)
        .map((m) => publicMedia(doc, m.photoId))
        .filter((p): p is NonNullable<typeof p> => !!p)
  const cards: TeamCard[] = members.map((m) => {
    const aiPhoto = isIllustrativeMedia(doc, m.photoId)
    // A named public member must never be shown with an AI portrait as if it were their photo.
    const photo = aiPhoto && !preview ? null : publicMedia(doc, m.photoId)
    return {
      id: m.id,
      name: pick(m.name, lang),
      jobTitle: pick(m.jobTitle, lang),
      bio: pick(m.bio, lang),
      department: pick(m.department, lang),
      photo: photo ? { url: photo.url, alt: pick(photo.alt, lang) || pick(m.name, lang), focalX: photo.focalX, focalY: photo.focalY } : null,
      draft: !isPublicTeamMember(m),
      illustrative: aiPhoto,
    }
  })
  const intro = pick(page.intro, lang).split(/\n{2,}/).filter(Boolean)
  const ar = lang === "ar"
  const info = publicSiteInfo(doc, lang)

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">{info.companyName}</p>
        <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-5xl">{pick(page.title, lang)}</h1>
        {intro.map((p, i) => (
          <p key={i} className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{p}</p>
        ))}
      </header>
      {preview && !page.visible && (
        <p className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {ar ? "صفحة الفريق مخفية حالياً ولن تظهر للزوار." : "The Team page is switched off and is not shown to visitors."}
        </p>
      )}

      {cards.length > 0 && (
        <TeamGrid
          cards={cards}
          draftLabel={ar ? "مسودة — غير منشور" : "Draft — not public"}
          emptyName={ar ? "مكان مخصص — أضف الاسم في مركز الموقع" : "Placeholder — add name in Website Center"}
          illustrativeLabel={ar ? "صورة توضيحية" : "Illustrative"}
        />
      )}

      {illustrative.length > 0 && <IllustrativeStrip photos={illustrative} lang={lang} />}

      <section
        aria-labelledby="team-contact"
        className="mt-14 flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8"
      >
        <div className="max-w-xl">
          <h2 id="team-contact" className="text-xl font-bold tracking-tight">
            {ar ? "تحدّث مع الورشة مباشرة" : "Talk to the workshop directly"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {ar
              ? "أخبرنا عن سيارتك وما تلاحظه، وسيرد عليك أحد أفراد الفريق المختص."
              : "Tell us about your car and what you are noticing, and the right person on the team will get back to you."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ContactActions
            phone={info.phone ?? ""}
            whatsapp={info.whatsapp ?? ""}
            callLabel={ar ? "اتصل" : "Call"}
            whatsappLabel={ar ? "واتساب" : "WhatsApp"}
            context="team"
          />
          <Link
            href={localePath(lang, doc.pages.appointment.visible ? "/appointment" : "/contact")}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {ar ? "احجز موعداً" : "Book an appointment"} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
