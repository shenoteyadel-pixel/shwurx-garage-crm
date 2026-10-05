import "server-only"
import { headers } from "next/headers"
import { getSettings } from "@/lib/settings"
import {
  analyticsFromLegacy,
  resolveRuntime,
  sanitizeAnalytics,
  SEED_ANALYTICS,
  type AnalyticsConfig,
  type RuntimeTags,
} from "./analytics"
import { isIndexableDeployment, resolveSiteOrigin } from "./env"
import type { WebsiteDocument } from "./types"

/** Website Center config once managed there; the legacy settings row until then. */
export async function effectiveAnalytics(doc: WebsiteDocument | null | undefined): Promise<AnalyticsConfig> {
  const stored = doc?.analytics ? sanitizeAnalytics(doc.analytics) : null
  if (stored?.managed) return stored
  try {
    return analyticsFromLegacy(await getSettings(), resolveSiteOrigin())
  } catch {
    return structuredClone(SEED_ANALYTICS)
  }
}

export async function requestHost(): Promise<string> {
  const h = await headers()
  return h.get("host") ?? h.get("x-forwarded-host") ?? ""
}

export async function siteAnalytics(doc: WebsiteDocument, preview: boolean): Promise<RuntimeTags> {
  const [cfg, host] = await Promise.all([effectiveAnalytics(doc), requestHost()])
  return {
    ...resolveRuntime(cfg, host, { preview, indexable: isIndexableDeployment() }),
    publicSlugs: { brands: doc.brands.filter((b) => b.visible).map((b) => b.slug), services: doc.services.filter((s) => s.visible).map((s) => s.slug) },
  }
}
