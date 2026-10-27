import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyUsers } from "@/lib/attendance-notify"
import { sendEmail } from "@/lib/email"
import { sendWhatsAppAlert, whatsAppConfigured } from "@/lib/whatsapp-send"
import { writeAudit } from "@/lib/rbac/context"
import { staffWithPermission, alertEmailHtml } from "@/lib/subscription-notify"
import { classifyFailure, dubaiToday, type IncidentCause, type SubscriptionLike } from "@/lib/subscriptions"

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com"
const SLOW_MS = 5000

interface Monitor {
  id: string
  name: string
  kind: "http" | "database" | "auth" | "backup" | "scheduled_job"
  target_url: string | null
  job_name: string | null
  freshness_hours: number | null
  criticality: string
  subscription_id: string | null
  escalation_contacts: string | null
  recovery_instructions: string | null
  last_status: string
  consecutive_failures: number
}

interface CheckResult {
  status: "up" | "down" | "degraded"
  latencyMs?: number
  httpStatus?: number
  error?: string
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now()
  const value = await fn()
  return [value, Date.now() - t]
}

async function checkHttp(url: string): Promise<CheckResult> {
  try {
    const [res, ms] = await timed(() =>
      fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "SWURX-Continuity-Monitor" } }),
    )
    if (res.status >= 500 || res.status === 402) return { status: "down", latencyMs: ms, httpStatus: res.status, error: `HTTP ${res.status}` }
    if (!res.ok) return { status: "degraded", latencyMs: ms, httpStatus: res.status, error: `HTTP ${res.status}` }
    return { status: ms > SLOW_MS ? "degraded" : "up", latencyMs: ms, httpStatus: res.status, error: ms > SLOW_MS ? "Slow response" : undefined }
  } catch (e) {
    return { status: "down", error: (e as Error).message }
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const svc = createServiceClient()
    const [{ error }, ms] = await timed(async () => svc.from("profiles").select("id", { head: true, count: "exact" }).limit(1))
    if (error) return { status: "down", latencyMs: ms, error: error.message }
    return { status: ms > SLOW_MS ? "degraded" : "up", latencyMs: ms }
  } catch (e) {
    return { status: "down", error: (e as Error).message }
  }
}

async function checkAuth(): Promise<CheckResult> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return { status: "down", error: "Supabase URL or anon key is not configured" }
  try {
    const [res, ms] = await timed(() => fetch(`${base}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(10_000) }))
    if (!res.ok) return { status: "down", latencyMs: ms, httpStatus: res.status, error: `Auth health HTTP ${res.status}` }
    return { status: "up", latencyMs: ms, httpStatus: res.status }
  } catch (e) {
    return { status: "down", error: (e as Error).message }
  }
}

async function checkFreshness(job: string, hours: number): Promise<CheckResult> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("scheduled_job_runs")
    .select("finished_at, status")
    .eq("job", job)
    .in("status", ["ok", "partial"])
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { status: "down", error: error.message }
  if (!data?.finished_at) return { status: "down", error: `No successful "${job}" run recorded yet` }
  const ageH = (Date.now() - Date.parse(data.finished_at as string)) / 3_600_000
  if (ageH > hours) return { status: "down", error: `Last successful run ${Math.round(ageH)}h ago (limit ${hours}h)` }
  return { status: data.status === "partial" ? "degraded" : "up", error: data.status === "partial" ? "Last run had failures" : undefined }
}

async function runCheck(m: Monitor): Promise<CheckResult> {
  switch (m.kind) {
    case "http":
      return checkHttp(m.target_url!)
    case "database":
      return checkDatabase()
    case "auth":
      return checkAuth()
    default:
      return checkFreshness(m.job_name!, m.freshness_hours ?? 24)
  }
}

const CAUSE_LABEL: Record<IncidentCause, string> = {
  outage: "Service outage",
  suspected_unpaid: "Suspected unpaid subscription",
  stale: "Job or backup is overdue",
}

async function alertIncident(m: Monitor, cause: IncidentCause, summary: string, recovered: boolean) {
  const people = await staffWithPermission("continuity.view")
  const title = recovered ? `Recovered: ${m.name}` : `${CAUSE_LABEL[cause]}: ${m.name}`
  const lines = recovered
    ? [`${m.name} is responding normally again.`]
    : [
        summary,
        cause === "suspected_unpaid"
          ? "The linked subscription is overdue. Check the provider billing before treating this as a technical outage."
          : "This looks like a technical problem, not a billing issue.",
        m.recovery_instructions ? `Recovery: ${m.recovery_instructions}` : "",
        m.escalation_contacts ? `Escalation contacts: ${m.escalation_contacts}` : "",
      ].filter(Boolean)
  await notifyUsers(
    people.map((p) => p.id),
    { title, body: lines.join(" "), type: recovered ? "info" : "alert", link: "/finance/continuity" },
  ).catch(() => {})
  for (const p of people) {
    if (p.email)
      await sendEmail({
        to: p.email,
        subject: title,
        html: alertEmailHtml({ title, lines, ctaLabel: "Open Critical Services", ctaUrl: `${SITE}/finance/continuity`, tone: recovered ? "ok" : "danger" }),
      })
    if (!recovered && whatsAppConfigured() && p.phone && (m.criticality === "critical" || m.criticality === "high"))
      await sendWhatsAppAlert(p.phone, `${title}. ${summary}`)
  }
}

export async function runServiceChecks(): Promise<{ checked: number; down: number; opened: number; resolved: number }> {
  const svc = createServiceClient()
  const today = dubaiToday()
  const { data: run } = await svc.from("scheduled_job_runs").insert({ job: "service-monitor" }).select("id").single()
  const { data: monitors } = await svc.from("service_monitors").select("*").eq("enabled", true)
  const stats = { checked: 0, down: 0, opened: 0, resolved: 0 }

  for (const m of (monitors ?? []) as Monitor[]) {
    let res = await runCheck(m)
    // One in-run retry so a single network blip does not page anyone.
    if (res.status === "down" && (m.kind === "http" || m.kind === "auth" || m.kind === "database")) {
      await new Promise((r) => setTimeout(r, 2000))
      res = await runCheck(m)
    }
    stats.checked++
    const nowIso = new Date().toISOString()
    await svc.from("service_checks").insert({
      monitor_id: m.id,
      status: res.status,
      latency_ms: res.latencyMs ?? null,
      http_status: res.httpStatus ?? null,
      error: res.error ?? null,
    })
    await svc
      .from("service_monitors")
      .update({
        last_status: res.status,
        last_checked_at: nowIso,
        last_success_at: res.status === "down" ? undefined : nowIso,
        last_error: res.error ?? null,
        consecutive_failures: res.status === "down" ? m.consecutive_failures + 1 : 0,
      })
      .eq("id", m.id)

    const { data: open } = await svc.from("service_incidents").select("id, cause").eq("monitor_id", m.id).is("resolved_at", null).maybeSingle()

    if (res.status === "down") {
      stats.down++
      if (open) continue
      let linked: SubscriptionLike | null = null
      if (m.subscription_id) {
        const { data } = await svc.from("subscriptions").select("*").eq("id", m.subscription_id).maybeSingle()
        linked = data ? ({ ...data, amount: Number(data.amount), fx_rate_to_aed: Number(data.fx_rate_to_aed), vat_rate: Number(data.vat_rate) } as SubscriptionLike) : null
      }
      const cause = classifyFailure({ kind: m.kind, linkedSubscription: linked, today })
      const summary = `${m.name}: ${res.error ?? "check failed"}`
      await svc.from("service_incidents").insert({ monitor_id: m.id, cause, summary, notified_at: nowIso })
      stats.opened++
      await writeAudit({ action: "service_incident_opened", resourceType: "service_monitor", resourceId: m.id, detail: { cause, summary }, status: "error" })
      await alertIncident(m, cause, summary, false)
    } else if (open) {
      await svc.from("service_incidents").update({ resolved_at: nowIso }).eq("id", open.id)
      stats.resolved++
      await writeAudit({ action: "service_incident_resolved", resourceType: "service_monitor", resourceId: m.id, detail: { incident: open.id } })
      await alertIncident(m, open.cause as IncidentCause, "", true)
    }
  }

  await svc
    .from("scheduled_job_runs")
    .update({ status: stats.down ? "partial" : "ok", finished_at: new Date().toISOString(), detail: stats })
    .eq("id", run?.id)
  return stats
}
