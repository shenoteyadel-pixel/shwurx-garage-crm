import type { MediaAsset, WebsiteDocument } from "@/lib/website/types"

/**
 * Media ids actually assigned somewhere in a document (hero, brand, service,
 * page, SEO, logo, …). The media library itself is skipped, so an uploaded
 * but unassigned image is never counted as used.
 */
export function assignedMediaIds(doc: WebsiteDocument): Set<string> {
  const known = new Set(doc.media.map((m) => m.id))
  const used = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (known.has(v)) used.add(v)
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x)
    } else if (v && typeof v === "object") {
      for (const x of Object.values(v)) walk(x)
    }
  }
  for (const [key, value] of Object.entries(doc)) if (key !== "media") walk(value)
  return used
}

export const isPublicMedia = (m: Pick<MediaAsset, "approval" | "publicSafe">) =>
  m.approval === "approved" && m.publicSafe

/** Ids that the LIVE site can actually render: assigned and public in that document. */
export function liveMediaIds(doc: WebsiteDocument | null): string[] {
  if (!doc) return []
  const assigned = assignedMediaIds(doc)
  return doc.media.filter((m) => assigned.has(m.id) && isPublicMedia(m)).map((m) => m.id)
}

export type MediaStatus = "hidden" | "unused" | "draft_only" | "live"

export function mediaStatus(
  m: Pick<MediaAsset, "id" | "approval" | "publicSafe">,
  draftAssigned: Set<string>,
  live: Set<string>,
): MediaStatus {
  if (live.has(m.id)) return "live"
  if (!isPublicMedia(m)) return "hidden"
  return draftAssigned.has(m.id) ? "draft_only" : "unused"
}

export const MEDIA_STATUS_LABEL: Record<MediaStatus, string> = {
  live: "Live on site",
  draft_only: "Assigned in draft, not published",
  unused: "Approved, not assigned",
  hidden: "Hidden (not approved or not safe)",
}
