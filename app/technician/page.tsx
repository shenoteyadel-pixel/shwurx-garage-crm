import Link from "next/link"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, ctxCan } from "@/lib/rbac/context"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { TaskStatusBadge, PriorityText } from "@/components/technician/task-status-badge"
import { ACTIVE_STATUSES, WAITING_STATUSES, formatDuration, liveSeconds, type TaskStatus } from "@/lib/technician-tasks"

export const metadata = { title: "My Workshop Tasks · SHWURX Auto Service Center" }

type Row = {
  id: string
  title: string
  status: TaskStatus
  priority: string
  deadline: string | null
  worked_seconds: number
  timer_started_at: string | null
  trade: string | null
  technician: { full_name: string | null } | null
  job: {
    job_number: string | null
    plate_code: string | null
    plate_number: string | null
    vehicle_make: string | null
    vehicle_model: string | null
    vehicle_year: number | null
    complaint: string | null
  } | null
}

export default async function TechnicianDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requirePageAccess(["jobs.view_assigned", "jobs.view_all"], "My Tasks")
  const { view } = await searchParams
  const canSeeAll = ctxCan(ctx, "jobs.view_all")
  const showAll = canSeeAll && view !== "mine"

  const supabase = await createClient()
  let query = supabase
    .from("technician_tasks")
    .select(
      "id, title, status, priority, deadline, worked_seconds, timer_started_at, trade, technician:profiles!technician_tasks_technician_id_fkey(full_name), job:jobs(job_number, plate_code, plate_number, vehicle_make, vehicle_model, vehicle_year, complaint)",
    )
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(300)
  if (!showAll) query = query.eq("technician_id", ctx.userId)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  query = query.or(`status.neq.qc_approved,updated_at.gte.${sevenDaysAgo}`)
  const [{ data }, user] = await Promise.all([query, getShellUser()])
  const rows = (data ?? []) as unknown as Row[]

  const groups = [
    { key: "active", title: "Active", rows: rows.filter((r) => ACTIVE_STATUSES.includes(r.status)) },
    { key: "waiting", title: "Waiting", rows: rows.filter((r) => WAITING_STATUSES.includes(r.status)) },
    { key: "qc", title: "Completed & QC", rows: rows.filter((r) => ["repair_completed", "qc_pending", "qc_approved"].includes(r.status)) },
  ]

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-balance">{showAll ? "Workshop tasks" : "My tasks"}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Open a task to start the clock, record the inspection, request parts and submit the technical report.
            </p>
          </div>
          {canSeeAll && (
            <nav aria-label="Task view" className="flex rounded-lg border border-border p-1 text-sm">
              <Link href="/technician" aria-current={showAll ? "page" : undefined} className={showAll ? "rounded-md bg-secondary px-3 py-1.5" : "px-3 py-1.5 text-muted-foreground"}>
                All technicians
              </Link>
              <Link href="/technician?view=mine" aria-current={!showAll ? "page" : undefined} className={!showAll ? "rounded-md bg-secondary px-3 py-1.5" : "px-3 py-1.5 text-muted-foreground"}>
                Mine
              </Link>
            </nav>
          )}
        </header>

        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-3">
            <h2 id={`g-${g.key}`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {g.title} <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">{g.rows.length}</span>
            </h2>
            {g.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {g.rows.map((r) => {
                  const overdue = r.deadline && new Date(r.deadline).getTime() < Date.now() && !["qc_approved", "qc_pending", "repair_completed"].includes(r.status)
                  const vehicle = [r.job?.vehicle_year, r.job?.vehicle_make, r.job?.vehicle_model].filter(Boolean).join(" ")
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/technician/tasks/${r.id}`}
                        className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">
                              {r.job?.job_number} · {[r.job?.plate_code, r.job?.plate_number].filter(Boolean).join(" ") || "No plate"}
                            </span>
                            <span className="font-medium text-pretty">{r.title}</span>
                            {vehicle && <span className="text-sm text-muted-foreground">{vehicle}</span>}
                          </div>
                          <TaskStatusBadge status={r.status} />
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <PriorityText priority={r.priority} />
                          <span className={r.timer_started_at ? "font-mono text-primary" : "font-mono"}>
                            {formatDuration(liveSeconds(r.worked_seconds, r.timer_started_at))}
                            {r.timer_started_at ? " · running" : ""}
                          </span>
                          {r.deadline && (
                            <span className={overdue ? "font-medium text-red-300" : undefined}>
                              {overdue ? "Overdue · " : "Due "}
                              {new Date(r.deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          )}
                          {showAll && r.technician?.full_name && <span>{r.technician.full_name}</span>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </AppShell>
  )
}
