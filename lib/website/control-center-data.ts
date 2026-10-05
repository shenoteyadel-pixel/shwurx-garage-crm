import "server-only"
import { getSettings, type Settings } from "@/lib/settings"
import { getSiteContentOverrides } from "@/lib/site-content"
import { listAllArticles, type Article } from "@/lib/blog"
import { localeIssues } from "@/lib/article-model"
import { getEditorState, readDocumentRow, readRevision, type EditorState } from "@/lib/website/store"
import { effectiveAnalytics } from "@/lib/website/analytics-server"
import { sanitizeAnalytics, type AnalyticsConfig } from "@/lib/website/analytics"
import { getDictionary } from "@/lib/i18n/dictionaries"
import { buildInventory, type InventoryItem } from "@/lib/website/inventory"
import { SITE_CONTENT_GROUPS, SITE_IMAGE_SLOTS, readPath } from "@/lib/site-content-fields"

import {
  pickTrackingSettings,
  type ControlCenterAccess,
  type TrackingSettingsDTO,
} from "@/lib/website/control-center-access"

export {
  resolveControlCenterAccess,
  type ControlCenterAccess,
  type TrackingSettingsDTO,
} from "@/lib/website/control-center-access"

type FieldMaps = { en: Record<string, unknown>; ar: Record<string, unknown> }

export type WebsiteSectionDTO = {
  fieldValues: FieldMaps
  fieldDefaults: FieldMaps
  images: Record<string, string>
  posts: Article[]
  editorState: EditorState | null
  taxonomy: ArticleTaxonomy
  overview: WebsiteOverviewDTO
}

export type ArticleTaxonomy = {
  brands: { slug: string; name: string }[]
  services: { slug: string; name: string }[]
}

export type WebsiteOverviewDTO = {
  /** configured public domain, or null when none is set */
  liveUrl: string | null
  lastPublishedAt: string | null
  lastPublishedBy: string | null
  inventory: InventoryItem[]
}

function configuredSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw || raw.includes("NEXT_PUBLIC")) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.origin
  } catch {
    return null
  }
}

/** Analytics-only view: config + revision pointers. Never any page, brand, blog or financial data. */
export type AnalyticsSectionDTO = {
  initialised: boolean
  hasLive: boolean
  draftVersion: number
  liveRevisionId: number | null
  config: AnalyticsConfig
  managed: boolean
}

export type ControlCenterDTO = {
  access: ControlCenterAccess
  website: WebsiteSectionDTO | null
  tracking: TrackingSettingsDTO | null
  analytics: AnalyticsSectionDTO | null
}

async function loadAnalyticsSection(): Promise<AnalyticsSectionDTO> {
  const { available, row } = await readDocumentRow()
  const liveRevisionId = row?.published_revision_id ?? null
  const live = liveRevisionId ? await readRevision(liveRevisionId) : null
  const stored = live?.analytics ? sanitizeAnalytics(live.analytics) : null
  return {
    initialised: available && !!row,
    hasLive: !!live,
    draftVersion: row?.draft_version ?? 0,
    liveRevisionId,
    config: await effectiveAnalytics(live),
    managed: !!stored?.managed,
  }
}

async function loadWebsiteSection(): Promise<WebsiteSectionDTO> {
  const [overrides, posts, editorState] = await Promise.all([
    getSiteContentOverrides(),
    listAllArticles(),
    getEditorState(),
  ])
  const enDict = getDictionary("en")
  const arDict = getDictionary("ar")
  const paths = SITE_CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => f.path))
  const images: Record<string, string> = {}
  for (const slot of SITE_IMAGE_SLOTS) {
    const v = overrides.images?.[slot.key]
    if (typeof v === "string" && v) images[slot.key] = v
  }
  const liveId = editorState?.publishedRevisionId ?? null
  const live = liveId ? await readRevision(liveId) : null
  const liveRev = editorState?.revisions.find((r) => r.id === liveId) ?? null
  const overview: WebsiteOverviewDTO = {
    liveUrl: configuredSiteUrl(),
    lastPublishedAt: liveRev?.createdAt ?? null,
    lastPublishedBy: liveRev?.createdByName ?? null,
    inventory: editorState?.initialised
      ? buildInventory(
          editorState.draft,
          live,
          posts.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.content.en.title,
            titleAr: p.content.ar.title,
            status: p.status,
            excerpt: p.content.en.excerpt || p.content.ar.excerpt || null,
            coverUrl: p.coverUrl,
            draftAhead: p.draftAhead,
            published: p.published,
            complete: {
              en: localeIssues(p.content.en).length === 0,
              ar: localeIssues(p.content.ar).length === 0,
            },
          })),
        )
      : [],
  }
  return {
    overview,
    fieldDefaults: {
      en: Object.fromEntries(paths.map((p) => [p, readPath(enDict, p)])),
      ar: Object.fromEntries(paths.map((p) => [p, readPath(arDict, p)])),
    },
    fieldValues: {
      en: Object.fromEntries(paths.map((p) => [p, readPath(overrides.en, p)])),
      ar: Object.fromEntries(paths.map((p) => [p, readPath(overrides.ar, p)])),
    },
    images,
    posts,
    editorState,
    taxonomy: {
      brands: (editorState?.draft?.brands ?? []).map((b) => ({ slug: b.slug, name: b.name.en || b.slug })),
      services: (editorState?.draft?.services ?? []).map((s) => ({ slug: s.slug, name: s.name.en || s.slug })),
    },
  }
}

/** Loads only what the caller's permissions allow; unauthorized sections are never queried. */
export async function loadControlCenter(access: ControlCenterAccess): Promise<ControlCenterDTO> {
  const [website, tracking, analytics] = await Promise.all([
    access.canManageWebsite ? loadWebsiteSection() : Promise.resolve(null),
    access.canViewMarketing ? getSettings().then(pickTrackingSettings) : Promise.resolve(null),
    access.canViewMarketing ? loadAnalyticsSection() : Promise.resolve(null),
  ])
  return { access, website, tracking, analytics }
}
