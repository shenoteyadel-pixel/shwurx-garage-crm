import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyUsers } from "@/lib/attendance-notify"
import { sendEmail } from "@/lib/email"
import { sendWhatsAppAlert, whatsAppConfigured } from "@/lib/whatsapp-send"
import { writeAudit } from "@/lib/rbac/context"
import { staffWithPermission, alertEmailHtml } from "@/lib/subscription-notify"
import { classifyFailure, dubaiToday, type IncidentCause, type SubscriptionLike } from "@/lib/subscriptions"
import { confirmBackupManifest } from "@/lib/database-backup"

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com"
const SLOW_MS = 5000

interface Monitor {
  id: string
  name: string
  kind: "http" | "database" | "auth" | "backup" | "scheduled_job" | "capacity"
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
  /** Real completion time of the last good job run (freshness checks only). */
  lastSuccessAt?: string
  /** The latest run actually failed, as opposed to simply being late. */
  failedRun?: boolean
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

const GB = 1024 ** 3
// Supabase Pro included quotas; override per plan with env vars.
const DB_LIMIT_GB = Number(process.env.SUPABASE_DB_LIMIT_GB) || 8
const STORAGE_LIMIT_GB = Number(process.env.SUPABASE_STORAGE_LIMIT_GB) || 100
const WARN_PCT = 80
const WATCH_PCT = 70

async function checkCapacity(): Promise<CheckResult> {
  try {
    const svc = createServiceClient()
    const [{ data, error }, ms] = await timed(async () => svc.rpc("service_usage"))
    if (error) return { status: "down", latencyMs: ms, error: `Could not read usage: ${error.message}` }
    const row = (Array.isArray(data) ? data[0] : data) as { db_bytes: number; storage_bytes: number } | null
    if (!row) return { status: "down", latencyMs: ms, error: "Usage function returned no data" }
    const dbPct = (Number(row.db_bytes) / (DB_LIMIT_GB * GB)) * 100
    const stPct = (Number(row.storage_bytes) / (STORAGE_LIMIT_GB * GB)) * 100
    const text =
      `Database ${(Number(row.db_bytes) / GB).toFixed(2)} of ${DB_LIMIT_GB} GB (${Math.round(dbPct)}%), ` +
      `file storage ${(Number(row.storage_bytes) / GB).toFixed(2)} of ${STORAGE_LIMIT_GB} GB (${Math.round(stPct)}%)`
    const worst = Math.max(dbPct, stPct)
    if (worst >= WARN_PCT) return { status: "down", latencyMs: ms, error: `Near limit. ${text}` }
    if (worst >= WATCH_PCT) return { status: "degraded", latencyMs: ms, error: text }
    return { status: "up", latencyMs: ms, error: text }
  } catch (e) {
    return { status: "down", error: (e as Error).message }
  }
}

interface JobRun {
  status: "running" | "ok" | "partial" | "failed"
  started_at: string
  finished_at: string | null
  detail: Record<string, unknown> | null
}

const STUCK_RUN_MS = 30 * 60_000

function runError(run: JobRun): string {
  const d = run.detail ?? {}
  const raw = d.error ?? d.remindersError ?? d.monitorError ?? (Array.isArray(d.failures) && d.failures.length ? JSON.stringify(d.failures[0]) : null)
  return typeof raw === "string" && raw ? raw.slice(0, 240) : "no error detail recorded"
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })

/**
 * Job/backup freshness. Reads the recorded runs (not the time of the check), so
 * "last success" is the real completion time. A failed latest run is reported
 * immediately, and a backup only counts when its verified manifest still exists.
 */
async function checkFreshness(m: Monitor): Promise<CheckResult> {
  const job = m.job_name!
  const hours = m.freshness_hours ?? 24
  const svc = createServiceClient()
  const { data: recent, error } = await svc
    .from("scheduled_job_runs")
    .select("status, started_at, finished_at, detail")
    .eq("job", job)
    .order("started_at", { ascending: false })
    .limit(10)
  if (error) return { status: "down", error: error.message }
  const runs = (recent ?? []) as JobRun[]

  let successQuery = svc
    .from("scheduled_job_runs")
    .select("status, started_at, finished_at, detail")
    .eq("job", job)
    .in("status", ["ok", "partial"])
    .not("finished_at", "is", null)
  if (m.kind === "backup") successQuery = successQuery.eq("detail->>verified", "true")
  const { data: success } = await successQuery.order("finished_at", { ascending: false }).limit(1).maybeSingle()
  const lastOk = success as JobRun | null

  if (m.kind === "backup" && lastOk) {
    const confirmed = await confirmBackupManifest(lastOk.detail?.manifest)
    if (!confirmed.ok) return { status: "down", error: confirmed.error, failedRun: true }
  }

  const latestFinished = runs.find((r) => r.status !== "running")
  if (latestFinished?.status === "failed" && (!lastOk || Date.parse(latestFinished.started_at) > Date.parse(lastOk.finished_at!))) {
    return {
      status: "down",
      error: `Last run failed ${when(latestFinished.started_at)}: ${runError(latestFinished)}`,
      lastSuccessAt: lastOk?.finished_at ?? undefined,
      failedRun: true,
    }
  }
  if (!lastOk?.finished_at) {
    const stuck = runs.find((r) => r.status === "running" && Date.now() - Date.parse(r.started_at) > STUCK_RUN_MS)
    return {
      status: "down",
      error: stuck
        ? `Run started ${when(stuck.started_at)} never finished`
        : m.kind === "backup"
          ? "No verified backup recorded yet"
          : `No successful "${job}" run recorded yet`,
    }
  }
  const ageH = (Date.now() - Date.parse(lastOk.finished_at)) / 3_600_000
  if (ageH > hours) {
    return { status: "down", error: `Last successful run ${Math.round(ageH)}h ago (limit ${hours}h)`, lastSuccessAt: lastOk.finished_at }
  }
  return {
    status: lastOk.status === "partial" ? "degraded" : "up",
    error: lastOk.status === "partial" ? `Last run had failures: ${runError(lastOk)}` : undefined,
    lastSuccessAt: lastOk.finished_at,
  }
}

async function runCheck(m: Monitor): Promise<CheckResult> {
  switch (m.kind) {
    case "http":
      return checkHttp(m.target_url!)
    case "database":
      return checkDatabase()
    case "auth":
      return checkAuth()
    case "capacity":
      return checkCapacity()
    default:
      return checkFreshness(m)
  }
}

const isLive = (m: Monitor) => m.kind === "http" || m.kind === "auth" || m.kind === "database"
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

const CAUSE_LABEL: Record<IncidentCause, string> = {
  outage: "Service outage",
  suspected_unpaid: "Suspected unpaid subscription",
  stale: "Job or backup is overdue",
  capacity: "Early warning, usage limit approaching",
}

async function alertIncident(m: Monitor, cause: IncidentCause, summary: string, recovered: boolean, failedRun = false) {
  const people = await staffWithPermission("continuity.view")
  const label = failedRun ? (m.kind === "backup" ? "Backup failed" : "Scheduled job failed") : CAUSE_LABEL[cause]
  const title = recovered ? `Recovered: ${m.name}` : `${label}: ${m.name}`
  const lines = recovered
    ? [`${m.name} is responding normally again.`]
    : [
        summary,
        cause === "capacity"
          ? "The CRM is still working. Act now so it does not stop when the limit is reached."
          : cause === "suspected_unpaid"
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

interface Stats {
  checked: number
  down: number
  opened: number
  resolved: number
  results: { monitor: string; status: CheckResult["status"]; error?: string }[]
}

async function checkAndRecord(m: Monitor, today: string, stats: Stats) {
  const svc = createServiceClient()
  let res = await runCheck(m)
  // One in-run retry so a single network blip does not page anyone.
  if (res.status === "down" && isLive(m)) {
    await pause(2000)
    res = await runCheck(m)
  }

  const { data: open } = await svc
    .from("service_incidents")
    .select("id, cause, summary")
    .eq("monitor_id", m.id)
    .is("resolved_at", null)
    .maybeSingle()

  // Recovery must be confirmed by a second healthy probe before an incident closes.
  if (open && res.status !== "down" && isLive(m)) {
    await pause(2000)
    const confirm = await runCheck(m)
    if (confirm.status === "down") res = confirm
  }

  stats.checked++
  stats.results.push({ monitor: m.name, status: res.status, error: res.error })
  const nowIso = new Date().toISOString()
  await svc.from("service_checks").insert({
    monitor_id: m.id,
    status: res.status,
    latency_ms: res.latencyMs ?? null,
    http_status: res.httpStatus ?? null,
    error: res.error ?? null,
  })
  const lastSuccess = isLive(m) ? (res.status === "down" ? undefined : nowIso) : res.lastSuccessAt
  await svc
    .from("service_monitors")
    .update({
      last_status: res.status,
      last_checked_at: nowIso,
      ...(lastSuccess ? { last_success_at: lastSuccess } : {}),
      last_error: res.error ?? null,
      consecutive_failures: res.status === "down" ? m.consecutive_failures + 1 : 0,
    })
    .eq("id", m.id)

  if (res.status === "down") {
    stats.down++
    const summary = `${m.name}: ${res.error ?? "check failed"}`
    if (open) {
      // A new failure on an already-open incident (e.g. a backup that now fails rather than being missing) still alerts.
      if (res.failedRun && open.summary !== summary) {
        await svc.from("service_incidents").update({ summary, notified_at: nowIso }).eq("id", open.id)
        await alertIncident(m, open.cause as IncidentCause, summary, false, true)
      }
      return
    }
    let linked: SubscriptionLike | null = null
    if (m.subscription_id) {
      const { data } = await svc.from("subscriptions").select("*").eq("id", m.subscription_id).maybeSingle()
      linked = data ? ({ ...data, amount: Number(data.amount), fx_rate_to_aed: Number(data.fx_rate_to_aed), vat_rate: Number(data.vat_rate) } as SubscriptionLike) : null
    }
    const cause: IncidentCause = m.kind === "capacity" ? "capacity" : classifyFailure({ kind: m.kind, linkedSubscription: linked, today })
    await svc.from("service_incidents").insert({ monitor_id: m.id, cause, summary, notified_at: nowIso })
    stats.opened++
    await writeAudit({ action: "service_incident_opened", resourceType: "service_monitor", resourceId: m.id, detail: { cause, summary }, status: "error" })
    await alertIncident(m, cause, summary, false, res.failedRun)
  } else if (open) {
    await svc.from("service_incidents").update({ resolved_at: nowIso }).eq("id", open.id)
    stats.resolved++
    await writeAudit({ action: "service_incident_resolved", resourceType: "service_monitor", resourceId: m.id, detail: { incident: open.id } })
    await alertIncident(m, open.cause as IncidentCause, "", true)
  }
}

const emptyStats = (): Stats => ({ checked: 0, down: 0, opened: 0, resolved: 0, results: [] })

/** Full pass over every enabled monitor; logged as a "service-monitor" job run. */
export async function runServiceChecks(): Promise<Omit<Stats, "results">> {
  const svc = createServiceClient()
  const today = dubaiToday()
  const { data: run } = await svc.from("scheduled_job_runs").insert({ job: "service-monitor" }).select("id").single()
  const { data: monitors } = await svc.from("service_monitors").select("*").eq("enabled", true).order("name")
  const stats = emptyStats()
  let fatal: string | null = null
  try {
    for (const m of (monitors ?? []) as Monitor[]) await checkAndRecord(m, today, stats)
  } catch (e) {
    fatal = (e as Error).message
  }
  await svc
    .from("scheduled_job_runs")
    .update({
      status: fatal ? "failed" : stats.down ? "partial" : "ok",
      finished_at: new Date().toISOString(),
      detail: { ...stats, ...(fatal ? { error: fatal } : {}) },
    })
    .eq("id", run?.id)
  if (fatal) throw new Error(fatal)
  const { results: _results, ...summary } = stats
  return summary
}

/** Re-evaluates the monitors that track `job` right after it reports, so status never lags the job history. */
export async function syncJobMonitors(job: string): Promise<void> {
  const svc = createServiceClient()
  const { data: monitors } = await svc.from("service_monitors").select("*").eq("enabled", true).eq("job_name", job)
  const stats = emptyStats()
  const today = dubaiToday()
  for (const m of (monitors ?? []) as Monitor[]) await checkAndRecord(m, today, stats)
}
