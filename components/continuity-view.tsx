"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, AlertTriangle, BellRing, DatabaseBackup, RefreshCw } from "lucide-react"
import { Badge, Button, Card } from "@/components/ui"
import { CRIT_TONE } from "@/components/subscription-labels"
import { runBackupNow, runChecksNow, runRemindersNow } from "@/lib/actions-continuity"

export interface MonitorRow {
  id: string
  name: string
  kind: string
  target: string
  criticality: string
  enabled: boolean
  last_status: "up" | "down" | "degraded" | "unknown"
  last_checked_at: string | null
  last_success_at: string | null
  last_error: string
  consecutive_failures: number
  escalation_contacts: string
  recovery_instructions: string
  subscription: { id: string; name: string; next_due_date: string } | null
}

export interface IncidentRow {
  id: string
  monitor: string
  cause: "outage" | "suspected_unpaid" | "stale" | "capacity"
  summary: string
  opened_at: string
  resolved_at: string | null
}

export interface JobRunRow {
  id: string
  job: string
  status: "running" | "ok" | "partial" | "failed"
  started_at: string
  finished_at: string | null
  log: string[]
  error: string
}

export interface OverdueRow {
  id: string
  name: string
  next_due_date: string
  criticality: string
}

const STATUS_TONE: Record<string, string> = {
  up: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-red-500",
  unknown: "bg-muted-foreground",
}
const STATUS_LABEL: Record<string, string> = { up: "Operational", degraded: "Degraded", down: "Down", unknown: "Not checked yet" }
const CAUSE_LABEL: Record<string, string> = { outage: "Outage", suspected_unpaid: "Possibly unpaid", stale: "Stale", capacity: "Near limit" }
const KIND_LABEL: Record<string, string> = { http: "Website", database: "Database", auth: "Sign-in", backup: "Backup", scheduled_job: "Scheduled job", capacity: "Usage limits" }
const RUN_TONE: Record<string, string> = { ok: "text-emerald-300", partial: "text-amber-300", failed: "text-red-300", running: "text-muted-foreground" }

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) : "Never"

export function ContinuityView({
  monitors,
  incidents,
  runs,
  overdue,
  canApprove,
}: {
  monitors: MonitorRow[]
  incidents: IncidentRow[]
  runs: JobRunRow[]
  overdue: OverdueRow[]
  canApprove: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<"checks" | "reminders" | "backup" | null>(null)
  const [msg, setMsg] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null)
  const open = incidents.filter((i) => !i.resolved_at)
  const down = monitors.filter((m) => m.enabled && m.last_status === "down").length
  const degraded = monitors.filter((m) => m.enabled && m.last_status === "degraded").length

  async function checks() {
    setBusy("checks")
    setMsg(null)
    const res = await runChecksNow()
    setBusy(null)
    if (!res.ok) return setMsg({ tone: "err", text: res.error })
    setMsg({ tone: "ok", text: `Checked ${res.checked} services. ${res.down ? `${res.down} down.` : "All reachable."}` })
    router.refresh()
  }

  async function reminders() {
    setBusy("reminders")
    setMsg(null)
    const res = await runRemindersNow()
    setBusy(null)
    if (!res.ok) return setMsg({ tone: "err", text: res.error })
    setMsg({ tone: "ok", text: `${res.due} renewals due for a reminder. ${res.sent} sent, ${res.failed} failed.` })
    router.refresh()
  }

  async function backup() {
    setBusy("backup")
    setMsg(null)
    const res = await runBackupNow()
    setBusy(null)
    if (!res.ok) {
      setMsg({ tone: "err", text: res.error })
    } else {
      setMsg({ tone: "ok", text: `Backup verified: ${res.tables} tables, ${res.totalRows.toLocaleString("en-US")} rows.` })
    }
    router.refresh()
  }

  const overall = down ? "down" : degraded ? "degraded" : monitors.some((m) => m.last_status === "unknown") ? "unknown" : "up"

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/finance/subscriptions" className="text-xs text-muted-foreground hover:text-foreground">
            Subscriptions & Renewals
          </Link>
          <h1 className="text-balance text-2xl font-semibold text-foreground">Critical Services</h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Live checks for the systems the garage depends on, with what to do when one fails.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={checks} disabled={busy !== null}>
            <RefreshCw className={busy === "checks" ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
            Run checks now
          </Button>
          {canApprove ? (
            <Button size="sm" variant="ghost" onClick={reminders} disabled={busy !== null}>
              <BellRing className="h-4 w-4" aria-hidden />
              Send due reminders
            </Button>
          ) : null}
          {canApprove ? (
            <Button size="sm" variant="ghost" onClick={backup} disabled={busy !== null}>
              <DatabaseBackup className={busy === "backup" ? "h-4 w-4 animate-pulse" : "h-4 w-4"} aria-hidden />
              {busy === "backup" ? "Backing up..." : "Run backup now"}
            </Button>
          ) : null}
        </div>
      </header>

      {msg ? (
        <p
          role={msg.tone === "err" ? "alert" : "status"}
          className={
            msg.tone === "err"
              ? "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              : "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          }
        >
          {msg.text}
        </p>
      ) : null}

      {overdue.length ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {overdue.length} subscription{overdue.length === 1 ? " is" : "s are"} overdue
          </p>
          <ul className="flex flex-col gap-1">
            {overdue.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/finance/subscriptions/${o.id}`} className="text-foreground underline-offset-2 hover:underline">
                  {o.name}
                </Link>
                <span className="text-xs text-muted-foreground">due {o.next_due_date}</span>
                <Badge className={CRIT_TONE[o.criticality as keyof typeof CRIT_TONE]}>{o.criticality}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card className="flex items-center gap-3 p-4">
        <span className={`h-3 w-3 shrink-0 rounded-full ${STATUS_TONE[overall]}`} aria-hidden />
        <p className="text-sm text-foreground">
          {overall === "up"
            ? "All monitored services are operational."
            : overall === "unknown"
              ? "Some services have not been checked yet. Run checks to get a baseline."
              : `${down} down, ${degraded} degraded. ${open.length} open incident${open.length === 1 ? "" : "s"}.`}
        </p>
      </Card>

      <section aria-labelledby="mon-h" className="flex flex-col gap-3">
        <h2 id="mon-h" className="text-sm font-semibold text-foreground">
          Monitors
        </h2>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {monitors.map((m) => (
            <li key={m.id}>
              <Card className={`flex h-full flex-col gap-3 p-4 ${m.enabled ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_TONE[m.last_status]}`} aria-hidden />
                      <span className="truncate font-medium text-foreground">{m.name}</span>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {KIND_LABEL[m.kind] ?? m.kind}
                      {m.target ? ` · ${m.target}` : ""}
                    </span>
                  </div>
                  <Badge className={CRIT_TONE[m.criticality]}>{m.criticality}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="text-foreground">
                      {m.enabled ? STATUS_LABEL[m.last_status] : "Disabled"}
                      {m.consecutive_failures > 1 ? ` (${m.consecutive_failures} fails)` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{m.kind === "backup" ? "Last verified backup" : m.kind === "scheduled_job" ? "Last successful run" : "Last success"}</dt>
                    <dd className="text-foreground">{fmt(m.last_success_at)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Last checked</dt>
                    <dd className="text-foreground">{fmt(m.last_checked_at)}</dd>
                  </div>
                </dl>
                {m.last_error && m.last_status !== "up" ? <p className="text-xs text-red-300">{m.last_error}</p> : null}
                {m.subscription ? (
                  <p className="text-xs text-muted-foreground">
                    Paid via{" "}
                    <Link href={`/finance/subscriptions/${m.subscription.id}`} className="text-foreground underline-offset-4 hover:underline">
                      {m.subscription.name}
                    </Link>
                    , next due {m.subscription.next_due_date}
                  </p>
                ) : null}
                {m.recovery_instructions && m.last_status !== "up" ? (
                  <details className="text-xs" open={m.last_status === "down"}>
                    <summary className="cursor-pointer text-muted-foreground">What to do</summary>
                    <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground">{m.recovery_instructions}</p>
                    {m.escalation_contacts ? <p className="mt-2 text-muted-foreground">Escalate to: {m.escalation_contacts}</p> : null}
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="inc-h" className="flex flex-col gap-3">
          <h2 id="inc-h" className="text-sm font-semibold text-foreground">
            Incidents
          </h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {incidents.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{i.monitor}</span>
                    <span className={i.resolved_at ? "text-xs text-muted-foreground" : "text-xs text-red-300"}>
                      {i.resolved_at ? `Resolved ${fmt(i.resolved_at)}` : "Open"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {CAUSE_LABEL[i.cause]} · {fmt(i.opened_at)} · {i.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="runs-h" className="flex flex-col gap-3">
          <h2 id="runs-h" className="text-sm font-semibold text-foreground">
            Scheduled job runs
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Scheduled jobs write here.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {runs.map((r) => (
                <li key={r.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40">
                      <span className="inline-flex items-center gap-2 text-sm text-foreground">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {r.job}
                      </span>
                      <span className="text-xs">
                        <span className={RUN_TONE[r.status]}>{r.status}</span>
                        <span className="text-muted-foreground"> · {fmt(r.started_at)}</span>
                      </span>
                    </summary>
                    <div className="flex flex-col gap-1 px-4 pb-3 text-xs">
                      <p className="text-muted-foreground">
                        Started {fmt(r.started_at)} · {r.finished_at ? `finished ${fmt(r.finished_at)}` : "not finished"}
                      </p>
                      {r.error ? <p className="break-words text-red-300">{r.error}</p> : null}
                      {r.log.length ? (
                        <ul className="flex flex-col gap-0.5 font-mono text-foreground">
                          {r.log.map((line, i) => (
                            <li key={i} className="break-words">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : !r.error ? (
                        <p className="text-muted-foreground">No details recorded for this run.</p>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
