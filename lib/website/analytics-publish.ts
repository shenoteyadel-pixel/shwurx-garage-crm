import { analyticsIssues, sanitizeAnalytics, type AnalyticsConfig, type AnalyticsIssue } from "./analytics"
import type { WebsiteDocument } from "./types"

/**
 * Pure planning for the marketing-only analytics publish. Only the analytics
 * block changes: the draft keeps every content edit, and the new live revision
 * is the CURRENT live document with analytics swapped in, so unpublished
 * website drafts are never published by marketing staff.
 */

export interface AnalyticsPublishInput {
  analytics: unknown
  expectedDraftVersion: unknown
  expectedLiveRevisionId: unknown
}

export interface AnalyticsPublishState {
  draft: WebsiteDocument
  draftVersion: number
  live: WebsiteDocument | null
  liveRevisionId: number | null
}

export type AnalyticsPublishPlan =
  | { ok: true; config: AnalyticsConfig; draft: WebsiteDocument; live: WebsiteDocument; issues: AnalyticsIssue[] }
  | { ok: false; error: string; issues?: AnalyticsIssue[]; conflict?: boolean }

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0

export function planAnalyticsPublish(input: AnalyticsPublishInput, state: AnalyticsPublishState): AnalyticsPublishPlan {
  if (!state.live || !state.liveRevisionId) {
    return { ok: false, error: "Publish the website once from Site builder before analytics can go live." }
  }
  if (!isPosInt(input.expectedDraftVersion) || input.expectedDraftVersion !== state.draftVersion) {
    return { ok: false, conflict: true, error: "The website draft changed since you opened this page. Reload, then publish again." }
  }
  if (!isPosInt(input.expectedLiveRevisionId) || input.expectedLiveRevisionId !== state.liveRevisionId) {
    return { ok: false, conflict: true, error: "The live website changed since you opened this page. Reload, then publish again." }
  }
  if (!input.analytics || typeof input.analytics !== "object") return { ok: false, error: "Invalid analytics settings." }
  const drops: string[] = []
  const config = sanitizeAnalytics({ ...(input.analytics as object), managed: true }, drops)
  const issues: AnalyticsIssue[] = [
    ...drops.map((message) => ({ level: "error" as const, where: "Analytics", message })),
    ...analyticsIssues(config),
  ]
  if (issues.some((i) => i.level === "error")) return { ok: false, error: "Fix the errors before publishing.", issues }
  return {
    ok: true,
    config,
    issues,
    draft: { ...state.draft, analytics: config },
    live: { ...state.live, analytics: config },
  }
}

/** Every key except analytics must be byte-identical — used by tests and as a server-side assertion. */
export function onlyAnalyticsChanged(before: WebsiteDocument, after: WebsiteDocument): boolean {
  const strip = (d: WebsiteDocument) => JSON.stringify({ ...d, analytics: undefined })
  return strip(before) === strip(after)
}
