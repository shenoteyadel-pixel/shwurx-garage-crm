import type { SupabaseClient } from "@supabase/supabase-js"
import { checkGoogle, getGoogleDashboard, type GoogleDashboard } from "@/lib/ai-marketing/google"

export interface GoogleAlert {
  level: "warning" | "info"
  message: string
}

export interface GoogleSyncRun {
  id: string
  trigger: "manual" | "cron"
  status: "ok" | "error"
  summary: string | null
  error: string | null
  metrics: { totals?: GoogleDashboard["totals"]; campaigns?: number; alerts?: GoogleAlert[]; customer?: string | null } | null
  actor_name: string | null
  started_at: string
  finished_at: string | null
}

const aed = (n: number) => `AED ${n.toFixed(2)}`

/** Read-only monitoring rules evaluated on real 30-day data. */
export function googleAlerts(d: GoogleDashboard): GoogleAlert[] {
  const alerts: GoogleAlert[] = []
  for (const c of d.campaigns) {
    if (c.status === "ENABLED" && c.cost >= 50 && c.conversions === 0) {
      alerts.push({ level: "warning", message: `"${c.name}" spent ${aed(c.cost)} in 30 days with 0 conversions.` })
    }
    if (c.status === "ENABLED" && c.impressions === 0) {
      alerts.push({ level: "info", message: `"${c.name}" is enabled but had no impressions in 30 days.` })
    }
  }
  const wasted = d.searchTerms.filter((t) => t.cost >= 20 && t.conversions === 0)
  if (wasted.length) {
    const total = wasted.reduce((n, t) => n + t.cost, 0)
    alerts.push({
      level: "warning",
      message: `${wasted.length} search terms spent ${aed(total)} with 0 conversions (negative-keyword candidates).`,
    })
  }
  const lowQs = d.keywords.filter((k) => k.qualityScore != null && k.qualityScore <= 4 && k.cost > 0)
  if (lowQs.length) alerts.push({ level: "info", message: `${lowQs.length} keywords with spend have Quality Score ≤ 4.` })
  return alerts
}

/**
 * Runs a real authenticated check + data pull and records the outcome.
 * "ok" is only recorded when Google Ads returned account data.
 */
export async function runGoogleSync(
  supabase: SupabaseClient,
  trigger: "manual" | "cron",
  actor: { id: string | null; name: string | null },
): Promise<{ ok: boolean; summary: string; dashboard: GoogleDashboard | null }> {
  const startedAt = new Date().toISOString()
  const check = await checkGoogle()
  let ok = false
  let summary = check.summary
  let error: string | null = null
  let metrics: GoogleSyncRun["metrics"] = null
  let dashboard: GoogleDashboard | null = null

  if (check.status === "connected") {
    const r = await getGoogleDashboard()
    if (r.state === "ok") {
      dashboard = r.data
      const alerts = googleAlerts(r.data)
      ok = true
      summary = `Synced ${r.data.campaigns.length} campaigns · ${aed(r.data.totals.cost)} spend, ${r.data.totals.clicks} clicks, ${r.data.totals.conversions.toFixed(1)} conversions (30d)${alerts.length ? ` · ${alerts.length} alerts` : ""}.`
      metrics = { totals: r.data.totals, campaigns: r.data.campaigns.length, alerts, customer: r.data.customer.name }
    } else {
      error = r.state === "error" ? r.error : `Missing: ${r.missing.join(", ")}`
      summary = "Authenticated, but the reporting query failed."
    }
  } else {
    const hint = typeof check.details.hint === "string" ? ` — ${check.details.hint}` : ""
    error = `${check.summary}${hint}`
  }

  await supabase.from("google_ads_sync_runs").insert({
    trigger,
    status: ok ? "ok" : "error",
    summary: summary.slice(0, 1000),
    error: error?.slice(0, 2000) ?? null,
    metrics,
    actor_id: actor.id,
    actor_name: actor.name,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })
  return { ok, summary: ok ? summary : (error ?? summary), dashboard }
}
