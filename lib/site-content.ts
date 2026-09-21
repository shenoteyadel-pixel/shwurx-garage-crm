import "server-only"
import { cache } from "react"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Editable website content overrides, stored as a single row in the
 * `site_content` table and deep-merged over the built-in i18n dictionary.
 *
 * - `en` / `ar` hold only the fields the Website Control Center has edited.
 * - `images` maps a named image slot (e.g. "home.hero") to a Blob URL.
 *
 * Read with the SERVICE client because anonymous visitors have no session and
 * the table is RLS-protected. Memoized per request via React cache().
 */
export type SiteContentOverrides = {
  en: Record<string, unknown>
  ar: Record<string, unknown>
  images: Record<string, string>
}

const EMPTY: SiteContentOverrides = { en: {}, ar: {}, images: {} }

export const getSiteContentOverrides = cache(async (): Promise<SiteContentOverrides> => {
  try {
    const svc = createServiceClient()
    const { data } = await svc.from("site_content").select("en, ar, images").eq("id", 1).maybeSingle()
    if (!data) return EMPTY
    return {
      en: (data.en as Record<string, unknown>) ?? {},
      ar: (data.ar as Record<string, unknown>) ?? {},
      images: (data.images as Record<string, string>) ?? {},
    }
  } catch {
    return EMPTY
  }
})

/** Resolve a named image slot to its overridden URL, or the shipped default. */
export function resolveImage(images: Record<string, string>, key: string, fallback: string): string {
  const v = images?.[key]
  return typeof v === "string" && v.trim() ? v : fallback
}
