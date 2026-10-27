import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { ContinuityView, type MonitorRow, type IncidentRow, type JobRunRow } from "@/components/continuity-view"

export const metadata = { title: "Critical Services · SHWURX Auto Service Center" }

export default async function ContinuityPage() {
  await requirePageAccess(["continuity.view"], "Critical Services")
  const supabase = await createClient()
  const [shellUser, canApprove, monRes, incRes, runRes, subRes] = await Promise.all([
    getShellUser(),
    can("subscriptions.approve"),
    supabase
      .from("service_monitors")
      .select("id, name, kind, target_url, job_name, freshness_hours, criticality, subscription_id, escalation_contacts, recovery_instructions, enabled, last_status, last_checked_at, last_success_at, last_error, consecutive_failures")
      .order("name"),
    supabase.from("service_incidents").select("id, monitor_id, cause, summary, opened_at, resolved_at").order("opened_at", { ascending: false }).limit(30),
    supabase.from("scheduled_job_runs").select("id, job, status, started_at, finished_at").order("started_at", { ascending: false }).limit(20),
    supabase.from("subscriptions").select("id, service_name, next_due_date, status"),
  ])

  const subs = new Map((subRes.data ?? []).map((s) => [s.id as string, s]))
  const monitors: MonitorRow[] = (monRes.data ?? []).map((m) => {
    const sub = m.subscription_id ? subs.get(m.subscription_id) : undefined
    return {
      id: m.id,
      name: m.name,
      kind: m.kind,
      target: m.target_url ?? m.job_name ?? "",
      criticality: m.criticality,
      enabled: !!m.enabled,
      last_status: m.last_status,
      last_checked_at: m.last_checked_at,
      last_success_at: m.last_success_at,
      last_error: m.last_error ?? "",
      consecutive_failures: m.consecutive_failures ?? 0,
      escalation_contacts: m.escalation_contacts ?? "",
      recovery_instructions: m.recovery_instructions ?? "",
      subscription: sub ? { id: sub.id as string, name: sub.service_name as string, next_due_date: String(sub.next_due_date).slice(0, 10) } : null,
    }
  })
  const names = new Map(monitors.map((m) => [m.id, m.name]))
  const incidents: IncidentRow[] = (incRes.data ?? []).map((i) => ({
    id: i.id,
    monitor: names.get(i.monitor_id) ?? "Monitor",
    cause: i.cause,
    summary: i.summary,
    opened_at: i.opened_at,
    resolved_at: i.resolved_at,
  }))
  const runs: JobRunRow[] = (runRes.data ?? []).map((r) => ({ id: r.id, job: r.job, status: r.status, started_at: r.started_at, finished_at: r.finished_at }))

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <ContinuityView monitors={monitors} incidents={incidents} runs={runs} canApprove={canApprove} />
      </div>
    </AppShell>
  )
}
