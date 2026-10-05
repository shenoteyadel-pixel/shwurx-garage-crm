import "server-only"
import { headers } from "next/headers"
import { getSettings } from "@/lib/settings"
import { analyticsFromLegacy, resolveRuntime, type AnalyticsConfig, type RuntimeTags } from "./analytics"
import { isIndexableDeployment, resolveSiteOrigin } from "./env"
import type { WebsiteDocument } from "./types"

/** Website Center config once managed there; the legacy settings row until then. */
export async function effectiveAnalytics(doc: WebsiteDocument): Promise<AnalyticsConfig> {
  if (doc.analytics.managed) return doc.analytics
  return analyticsFromLegacy(await getSettings(), resolveSiteOrigin())
}

export async function requestHost(): Promise<string> {
  const h = await headers()
  return h.get("host") ?? h.get("x-forwarded-host") ?? ""
}

export async function siteAnalytics(doc: WebsiteDocument, preview: boolean): Promise<RuntimeTags> {
  const [cfg, host] = await Promise.all([effectiveAnalytics(doc), requestHost()])
  return resolveRuntime(cfg, host, { preview, indexable: isIndexableDeployment() })
}
