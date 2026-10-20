export const REC_STATUSES = ["pending", "approved", "rejected", "executed", "failed"] as const
export type RecStatus = (typeof REC_STATUSES)[number]

export const REC_PLATFORMS = ["meta", "google", "general"] as const
export type RecPlatform = (typeof REC_PLATFORMS)[number]

export interface MarketingRecommendation {
  id: string
  platform: RecPlatform
  title: string
  summary: string | null
  source: "manual" | "ai"
  status: RecStatus
  created_by_name: string | null
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string | null
  executed_at: string | null
  failed_at: string | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface MarketingRecommendationEvent {
  id: string
  recommendation_id: string
  event: string
  from_status: string | null
  to_status: string | null
  actor_name: string | null
  note: string | null
  created_at: string
}

export const AI_MARKETING_SECTIONS = [
  "overview",
  "meta",
  "google",
  "recommendations",
  "approvals",
  "history",
  "settings",
] as const
export type AiMarketingSection = (typeof AI_MARKETING_SECTIONS)[number]

/** Phase 1: no ad platform is connected and nothing can be executed. */
export const AI_MARKETING_EXECUTION_ENABLED = false
