import type { L10n, SeoFields, WebsiteDocument } from "./types"
import type { PublishedArticleSummary } from "@/lib/article-model"
import { isIllustrativeMedia, isPublicTeamMember, isTeamPagePublic, publicTeamMembers } from "./normalize"

/**
 * Website Center inventory: one row per public page, derived from the real
 * draft and published documents. Pure so it can be tested on fixtures.
 */

export type InventoryType = "core" | "brand" | "service" | "team" | "custom" | "blog" | "form"
export type InventoryStatus = "published" | "draft" | "hidden"

/** Which builder section / record the Edit button opens. */
export type InventoryEditTarget =
  | {
      kind: "builder"
      section: "business" | "pages" | "team" | "brands" | "services" | "custom" | "form" | "nav" | "seo" | "media"
      recordId?: string
    }
  | { kind: "blog"; postId?: string }
  /** the route exists but has no Website Center controls; `reason` is shown instead of Edit */
  | { kind: "none"; reason: string }

export interface InventoryItem {
  key: string
  type: InventoryType
  title: L10n
  /** English path; Arabic is the same path under /ar */
  path: string
  status: InventoryStatus
  /** draft content differs from what is live */
  changed: boolean
  complete: { en: boolean; ar: boolean }
  flags: string[]
  edit: InventoryEditTarget
}

export interface InventoryPost {
  id: string
  slug: string
  title: string
  status: string
  excerpt: string | null
  coverUrl: string | null
  titleAr?: string
  complete?: { en: boolean; ar: boolean }
  draftAhead?: boolean
  published?: PublishedArticleSummary | null
}

const filled = (v: string | undefined) => !!v && v.trim().length > 0
const both = (v: L10n | undefined) => ({ en: filled(v?.en), ar: filled(v?.ar) })
const allOf = (...vals: (L10n | undefined)[]) => ({
  en: vals.every((v) => filled(v?.en)),
  ar: vals.every((v) => filled(v?.ar)),
})

function seoFlags(seo: SeoFields | undefined, flags: string[]) {
  const d = both(seo?.description)
  if (!d.en && !d.ar) flags.push("SEO description missing")
  else if (!d.en) flags.push("English SEO description missing")
  else if (!d.ar) flags.push("Arabic SEO description missing")
}

function status(
  draftVisible: boolean,
  inLive: boolean,
  liveVisible: boolean,
): InventoryStatus {
  if (!draftVisible) return "hidden"
  if (!inLive || !liveVisible) return "draft"
  return "published"
}

const json = (v: unknown) => JSON.stringify(v ?? null)

export function buildInventory(
  draft: WebsiteDocument,
  live: WebsiteDocument | null,
  posts: InventoryPost[],
): InventoryItem[] {
  const items: InventoryItem[] = []
  const hasLive = !!live
  const p = draft.pages
  const lp = live?.pages

  const core = (
    key: keyof Pick<typeof p, "home" | "about" | "contact" | "brandsIndex" | "servicesIndex" | "privacy">,
    path: string,
    title: L10n,
    extra: (flags: string[]) => void = () => {},
    complete = both(title),
  ) => {
    const flags: string[] = []
    if (!complete.en || !complete.ar) flags.push("Title missing in " + (!complete.en ? "English" : "Arabic"))
    seoFlags(p[key].seo, flags)
    extra(flags)
    items.push({
      key: `page:${key}`,
      type: "core",
      title,
      path,
      status: hasLive ? "published" : "draft",
      changed: json(p[key]) !== json(lp?.[key]),
      complete,
      flags,
      edit: { kind: "builder", section: "pages", recordId: key },
    })
  }

  core("home", "/", p.home.title, (f) => {
    if (!p.home.heroImageId) f.push("No hero image")
  }, allOf(p.home.title, p.home.subtitle))
  core("brandsIndex", "/brands", p.brandsIndex.title)
  for (const b of draft.brands) {
    const lb = live?.brands.find((x) => x.id === b.id)
    const flags: string[] = []
    const complete = allOf(b.name, b.intro)
    if (!complete.en || !complete.ar) flags.push(`Intro missing in ${!complete.en ? "English" : "Arabic"}`)
    if (!b.logoId) flags.push("No logo")
    if (b.galleryIds.length === 0) flags.push("No gallery photos")
    seoFlags(b.seo, flags)
    items.push({
      key: `brand:${b.id}`,
      type: "brand",
      title: b.name,
      path: `/brands/${b.slug}`,
      status: status(b.visible, !!lb, !!lb?.visible),
      changed: json(b) !== json(lb),
      complete,
      flags,
      edit: { kind: "builder", section: "brands", recordId: b.id },
    })
  }
  core("servicesIndex", "/services", p.servicesIndex.title)
  for (const s of draft.services) {
    const ls = live?.services.find((x) => x.id === s.id)
    const flags: string[] = []
    const complete = allOf(s.name, s.summary, s.intro)
    if (!complete.en || !complete.ar) flags.push(`Copy missing in ${!complete.en ? "English" : "Arabic"}`)
    if (s.galleryIds.length === 0) flags.push("No gallery photos")
    seoFlags(s.seo, flags)
    items.push({
      key: `service:${s.id}`,
      type: "service",
      title: s.name,
      path: `/services/${s.slug}`,
      status: status(s.visible, !!ls, !!ls?.visible),
      changed: json(s) !== json(ls),
      complete,
      flags,
      edit: { kind: "builder", section: "services", recordId: s.id },
    })
  }
  core("about", "/about", p.about.title, (f) => {
    if (!p.about.imageId) f.push("No image")
  }, allOf(p.about.title, p.about.body))

  {
    const team = p.team
    const active = team.members.filter((m) => !m.archived)
    const ready = publicTeamMembers(draft)
    const flags: string[] = []
    // Counts mirror the /team renderer: only isPublicTeamMember members render, and an AI portrait is never shown for a named member.
    const hidden = active.filter((m) => !m.visible).length
    const drafts = active.filter((m) => m.visible && !isPublicTeamMember(m)).length
    if (ready.length === 0) flags.push("No complete visible members yet — page shows intro and contact invitation")
    else flags.push(`${ready.length} member(s) shown publicly`)
    if (drafts > 0) flags.push(`${drafts} visible member slot(s) incomplete — not shown`)
    if (hidden > 0) flags.push(`${hidden} member(s) hidden`)
    const noPhoto = ready.filter((m) => !m.photoId || isIllustrativeMedia(draft, m.photoId) || !draft.media.some((x) => x.id === m.photoId)).length
    if (noPhoto) flags.push(`${noPhoto} public member(s) without a photo`)
    seoFlags(team.seo, flags)
    const liveTeamPublic = !!live && isTeamPagePublic(live)
    items.push({
      key: "page:team",
      type: "team",
      title: team.title,
      path: "/team",
      status: !team.visible ? "hidden" : isTeamPagePublic(draft) && liveTeamPublic ? "published" : "draft",
      changed: json(team) !== json(lp?.team),
      complete: both(team.title),
      flags,
      edit: { kind: "builder", section: "team" },
    })
  }

  core("contact", "/contact", p.contact.title)

  items.push({
    key: "page:appointment",
    type: "form",
    title: p.appointment.title,
    path: "/appointment",
    status: status(p.appointment.visible, !!lp?.appointment, !!lp?.appointment.visible),
    changed: json(p.appointment) !== json(lp?.appointment) || json(draft.forms.appointment) !== json(live?.forms.appointment),
    complete: allOf(p.appointment.title, p.appointment.body),
    flags: draft.forms.appointment.enabled ? [] : ["Online requests disabled; contact alternative shown"],
    edit: { kind: "builder", section: "pages", recordId: "appointment" },
  })
  items.push({
    key: "form:appointment",
    type: "form",
    title: { en: "Appointment form", ar: "نموذج طلب الموعد" },
    path: "/appointment",
    status: status(p.appointment.visible && draft.forms.appointment.enabled, !!live, !!lp?.appointment.visible && !!live?.forms.appointment.enabled),
    changed: json(draft.forms.appointment) !== json(live?.forms.appointment),
    complete: {
      en: !!draft.forms.appointment.copy.en.submit.trim(),
      ar: !!draft.forms.appointment.copy.ar.submit.trim(),
    },
    flags: [],
    edit: { kind: "builder", section: "form", recordId: "appointment-form" },
  })

  items.push({
    key: "page:blog",
    type: "blog",
    title: { en: "Blog", ar: "المدونة" },
    path: "/blog",
    status: posts.some((x) => x.status === "published") ? "published" : "draft",
    changed: false,
    complete: { en: true, ar: true },
    flags: posts.some((x) => x.status === "published") ? [] : ["No published posts"],
    edit: { kind: "blog" },
  })
  for (const post of posts) {
    const published = post.status === "published" ? post.published : null
    const flags: string[] = []
    const excerpt = published ? published.excerpt.en || published.excerpt.ar : post.excerpt
    if (!filled(excerpt ?? "")) flags.push("No excerpt (used as description)")
    if (!(published ? published.coverUrl : post.coverUrl)) flags.push("No cover image")
    if (post.status === "published" && !published) flags.push("Live snapshot metadata unavailable")
    items.push({
      key: `post:${post.id}`,
      type: "blog",
      title: published?.title ?? { en: post.title, ar: post.titleAr ?? "" },
      path: `/blog/${published?.slug ?? post.slug}`,
      status: post.status === "published" ? "published" : "draft",
      changed: post.draftAhead === true,
      complete: published
        ? { en: published.locales.includes("en"), ar: published.locales.includes("ar") }
        : post.status === "published" ? { en: false, ar: false }
        : post.complete ?? { en: filled(post.title), ar: filled(post.titleAr) },
      flags,
      edit: { kind: "blog", postId: post.id },
    })
  }

  core("privacy", "/privacy", p.privacy.title, () => {}, allOf(p.privacy.title, p.privacy.body))

  for (const c of p.custom) {
    const lc = lp?.custom.find((x) => x.id === c.id)
    const flags: string[] = []
    const complete = both(c.title)
    if (!complete.en || !complete.ar) flags.push(`Title missing in ${!complete.en ? "English" : "Arabic"}`)
    if (c.blocks.length === 0) flags.push("No content blocks")
    seoFlags(c.seo, flags)
    items.push({
      key: `custom:${c.id}`,
      type: "custom",
      title: c.title,
      path: `/pages/${c.slug}`,
      status: status(c.visible, !!lc, !!lc?.visible),
      changed: json(c) !== json(lc),
      complete,
      flags,
      edit: { kind: "builder", section: "custom", recordId: c.id },
    })
  }

  return items
}
