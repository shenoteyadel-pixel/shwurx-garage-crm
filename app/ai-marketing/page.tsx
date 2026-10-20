import { redirect } from "next/navigation"
import { requireStaff } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { AiMarketingManager } from "@/components/ai-marketing/manager"
import {
  AI_MARKETING_SECTIONS,
  type AiMarketingSection,
  type MarketingRecommendation,
  type MarketingRecommendationEvent,
} from "@/lib/ai-marketing/types"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "AI Marketing Manager · SHWURX",
  description: "Owner-only review and approval of marketing recommendations.",
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

  const [recsRes, eventsRes] = await Promise.all([
    supabase
      .from("ai_marketing_recommendations")
      .select(
        "id, platform, title, summary, source, status, created_by_name, decided_by_name, decided_at, decision_note, executed_at, failed_at, failure_reason, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ai_marketing_recommendation_events")
      .select("id, recommendation_id, event, from_status, to_status, actor_name, note, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
  ])

  const loadError = recsRes.error?.message ?? eventsRes.error?.message ?? null

  return (
    <AppShell user={shellUser}>
      <AiMarketingManager
        initialSection={initialSection}
        recommendations={(recsRes.data ?? []) as MarketingRecommendation[]}
        events={(eventsRes.data ?? []) as MarketingRecommendationEvent[]}
        loadError={loadError}
      />
    </AppShell>
  )
}
