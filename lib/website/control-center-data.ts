import "server-only"
import { getSettings, type Settings } from "@/lib/settings"
import { getSiteContentOverrides } from "@/lib/site-content"
import { listAllPosts, type BlogPost } from "@/lib/blog"
import { getEditorState, type EditorState } from "@/lib/website/store"
import { getDictionary } from "@/lib/i18n/dictionaries"
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
  posts: BlogPost[]
  editorState: EditorState | null
}

export type ControlCenterDTO = {
  access: ControlCenterAccess
  website: WebsiteSectionDTO | null
  tracking: TrackingSettingsDTO | null
}

async function loadWebsiteSection(): Promise<WebsiteSectionDTO> {
  const [overrides, posts, editorState] = await Promise.all([
    getSiteContentOverrides(),
    listAllPosts(),
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
  return {
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
  }
}

/** Loads only what the caller's permissions allow; unauthorized sections are never queried. */
export async function loadControlCenter(access: ControlCenterAccess): Promise<ControlCenterDTO> {
  const [website, tracking] = await Promise.all([
    access.canManageWebsite ? loadWebsiteSection() : Promise.resolve(null),
    access.canViewMarketing ? getSettings().then(pickTrackingSettings) : Promise.resolve(null),
  ])
  return { access, website, tracking }
}
