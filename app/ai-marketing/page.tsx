import { redirect } from "next/navigation"
import { requireStaff } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { AiMarketingManager } from "@/components/ai-marketing/manager"
import { getMetaPerformance } from "@/lib/ai-marketing/meta"
import { getGooglePerformance } from "@/lib/ai-marketing/google"
import { computeAttribution } from "@/lib/ai-marketing/attribution"
import {
  AI_MARKETING_SECTIONS,
  LIVE_EXECUTION_ENV,
  type ActionLogEntry,
  type AiMarketingSection,
  type CheckType,
  type ExecutionSetting,
  type IntegrationCheck,
  type MarketingRecommendation,
  type MarketingRecommendationEvent,
} from "@/lib/ai-marketing/types"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "AI Marketing Manager · SHWURX",
  description: "Owner-only AI marketing agent with approval-gated ad actions.",
}

export default async function AiMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const ctx = await requireStaff()
  if (ctx.role !== "owner") redirect("/denied?from=AI%20Marketing%20Manager")

  const [{ section }, shellUser, supabase] = await Promise.all([searchParams, getShellUser(), createClient()])
  const initialSection: AiMarketingSection = (AI_MARKETING_SECTIONS as readonly string[]).includes(section ?? "")
    ? (section as AiMarketingSection)
    : "overview"

  const [recsRes, eventsRes, checksRes, logRes, settingsRes, meta, google] = await Promise.all([
    supabase
      .from("ai_marketing_recommendations")
      .select(
        "id, platform, title, summary, source, status, created_by_name, decided_by_name, decided_at, decision_note, executed_at, failed_at, failure_reason, created_at, updated_at, proposed_action",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ai_marketing_recommendation_events")
      .select("id, recommendation_id, event, from_status, to_status, actor_name, note, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("ai_marketing_integration_checks")
      .select("id, check_type, ok, status, summary, details, checked_by_name, checked_at")
      .order("checked_at", { ascending: false })
      .limit(60),
    supabase
      .from("ai_marketing_action_log")
      .select(
        "id, recommendation_id, platform, account_id, action_type, previous_values, new_values, api_result, status, actor_name, created_at, finished_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("ai_marketing_execution_settings").select("platform, publishing_enabled, changed_by_name, changed_at"),
    getMetaPerformance(),
    getGooglePerformance(),
  ])

  const attribution = await computeAttribution(supabase, {
    meta: meta.state === "ok" ? meta.data.totals.spend : null,
    google: google.state === "ok" ? google.data.totals.spend : null,
  }).catch(() => null)

  const latestChecks: Partial<Record<CheckType, IntegrationCheck>> = {}
  for (const c of (checksRes.data ?? []) as IntegrationCheck[]) {
    latestChecks[c.check_type] ??= c
  }

  const loadError = recsRes.error?.message ?? eventsRes.error?.message ?? null

  return (
    <AppShell user={shellUser}>
      <AiMarketingManager
        initialSection={initialSection}
        recommendations={(recsRes.data ?? []) as MarketingRecommendation[]}
        events={(eventsRes.data ?? []) as MarketingRecommendationEvent[]}
        checks={latestChecks}
        actionLog={(logRes.data ?? []) as ActionLogEntry[]}
        execSettings={(settingsRes.data ?? []) as ExecutionSetting[]}
        liveEnvEnabled={process.env[LIVE_EXECUTION_ENV] === "true"}
        meta={meta}
        google={google}
        attribution={attribution}
        loadError={loadError}
      />
    </AppShell>
  )
}
