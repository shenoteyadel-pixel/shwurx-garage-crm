import { redirect } from "next/navigation"
import { requireStaff } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { GoogleAdsIntegration } from "@/components/ai-marketing/google-ads"
import { getGoogleConfigStatus, getGoogleDashboard } from "@/lib/ai-marketing/google"
import { getGoogleLeadFunnel } from "@/lib/ai-marketing/google-leads"
import { googleAlerts, type GoogleSyncRun } from "@/lib/ai-marketing/google-sync"
import { googleRedirectUri } from "@/lib/ai-marketing/google-oauth"
import { LIVE_EXECUTION_ENV } from "@/lib/ai-marketing/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export const metadata = {
  title: "Google Ads Integration · SHWURX",
  description: "Read-only Google Ads reporting, diagnostics and CRM lead tracking.",
}

export default async function GoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string }>
}) {
  const ctx = await requireStaff()
  if (ctx.role !== "owner") redirect("/denied?from=Google%20Ads")

  const [params, shellUser, supabase] = await Promise.all([searchParams, getShellUser(), createClient()])
  const [config, runsRes, dashboard] = await Promise.all([
    getGoogleConfigStatus(),
    supabase
      .from("google_ads_sync_runs")
      .select("id, trigger, status, summary, error, metrics, actor_name, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(20),
    getGoogleDashboard(),
  ])
  const funnel = await getGoogleLeadFunnel(supabase).catch(() => [])
  const runs = (runsRes.data ?? []) as GoogleSyncRun[]

  return (
    <AppShell user={shellUser}>
      <GoogleAdsIntegration
        config={config}
        redirectUri={googleRedirectUri()}
        runs={runs}
        dashboard={dashboard}
        alerts={dashboard.state === "ok" ? googleAlerts(dashboard.data) : []}
        funnel={funnel}
        liveExecution={process.env[LIVE_EXECUTION_ENV] === "true"}
        flash={params.oauth === "ok" ? { ok: true, text: "Google authorized and verified with a live API call." } : params.oauth_error ? { ok: false, text: params.oauth_error } : null}
      />
    </AppShell>
  )
}
