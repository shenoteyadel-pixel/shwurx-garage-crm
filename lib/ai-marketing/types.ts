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

export const CHECK_TYPES = ["meta", "google", "ai", "attribution"] as const
export type CheckType = (typeof CHECK_TYPES)[number]
export type CheckStatus = "connected" | "limited" | "not_configured" | "error"

export interface IntegrationCheck {
  id: string
  check_type: CheckType
  ok: boolean
  status: CheckStatus
  summary: string
  details: Record<string, unknown>
  checked_by_name: string | null
  checked_at: string
}

export interface CampaignRow {
  id: string
  name: string
  status: string
  objective: string | null
  dailyBudget: number | null
  spend: number
  impressions: number
  clicks: number
  leads: number
}

export interface PlatformPerformance {
  platform: "meta" | "google"
  accountId: string
  currency: string
  rangeLabel: string
  campaigns: CampaignRow[]
  totals: { spend: number; impressions: number; clicks: number; leads: number }
  adSetCount: number | null
  adCount: number | null
}

export type LiveResult<T> =
  | { state: "not_configured"; missing: string[] }
  | { state: "error"; error: string }
  | { state: "ok"; data: T }

export const ACTION_KINDS = ["none", "create_campaign", "update_budget", "set_status"] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export interface ProposedAction {
  kind: ActionKind
  campaign_id?: string | null
  name?: string | null
  objective?: string | null
  daily_budget_aed?: number | null
  status?: "PAUSED" | "ACTIVE" | null
}

export interface AiContent {
  title_ar?: string
  summary_ar?: string
  rationale?: string
  ad_copy_en?: string
  ad_copy_ar?: string
  creative_brief?: string
  targeting?: string
  objective?: string
  segment?: string
}

export interface ActionLogEntry {
  id: string
  recommendation_id: string | null
  platform: "meta" | "google"
  account_id: string | null
  action_type: string
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  api_result: Record<string, unknown> | null
  status: "started" | "succeeded" | "failed" | "blocked"
  actor_name: string | null
  created_at: string
  finished_at: string | null
}

export interface ExecutionSetting {
  platform: "meta" | "google"
  publishing_enabled: boolean
  changed_by_name: string | null
  changed_at: string
}

export interface AttributionChannel {
  channel: "meta" | "google"
  leads: number
  linkedLeads: number
  appointments: number
  jobs: number
  customers: number
  revenue: number
  spend: number | null
  costPerLead: number | null
  costPerAppointment: number | null
  costPerCustomer: number | null
  roas: number | null
  leadToCustomerRate: number | null
}

export interface AttributionReport {
  days: number
  channels: AttributionChannel[]
  campaigns: { channel: "meta" | "google"; campaign: string; leads: number; customers: number; revenue: number }[]
  advisors: { name: string; leads: number; customers: number }[]
  notes: string[]
}

/** Server env switch that must be "true" (in addition to the per-platform DB switch) for any live action. */
export const LIVE_EXECUTION_ENV = "AI_MARKETING_LIVE_EXECUTION"
