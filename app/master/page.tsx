import Link from "next/link"
import { requirePageAccess, ctxCan } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { getShellUser } from "@/lib/shell-user"
import { TaskStatusBadge } from "@/components/technician/task-status-badge"
import { MasterTaskActions } from "@/components/technician/master-task-actions"
import { MASTER_ELIGIBLE_ROLES, isMasterTeamMember } from "@/lib/master-tech"
import { formatDuration, liveSeconds, type TaskStatus } from "@/lib/technician-tasks"

export const metadata = { title: "Master Technician · SHWURX Auto Service Center" }

const DONE: TaskStatus[] = ["qc_approved"]

type Task = {
  id: string
  job_id: string
  title: string
  status: TaskStatus
  deadline: string | null
  worked_seconds: number
  timer_started_at: string | null
  technician_id: string
  estimated_hours: number | null
  delay_reason: string | null
  rework_count: number
}

export default async function MasterWorkspace({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requirePageAccess(["tasks.assign", "jobs.assign"], "Master Technician")
  const { view } = await searchParams
  const isManager = ctxCan(ctx, "jobs.assign")
  const showAll = isManager && view === "all"
  const canQc = ctxCan(ctx, "jobs.qc_approve")
  const svc = createServiceClient()

  let jobsQuery = svc
    .from("jobs")
    .select("id, job_number, stage, plate_code, plate_number, vehicle_make, vehicle_model, master_technician_id, advisor_id, approval_status")
    .is("deleted_at", null)
    .neq("stage", "delivered")
    .not("master_technician_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)
  if (!showAll) jobsQuery = jobsQuery.eq("master_technician_id", ctx.userId)
  const { data: jobs } = await jobsQuery
  const jobIds = (jobs ?? []).map((j) => j.id)

  const [{ data: taskRows }, { data: staff }] = await Promise.all([
    jobIds.length
      ? svc
          .from("technician_tasks")
          .select("id, job_id, title, status, deadline, worked_seconds, timer_started_at, technician_id, estimated_hours, delay_reason, rework_count")
          .in("job_id", jobIds)
          .order("deadline", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as Task[] }),
    svc.from("profiles").select("id, full_name, role, job_title").eq("is_active", true).in("role", MASTER_ELIGIBLE_ROLES).order("full_name"),
  ])
  const tasks = (taskRows ?? []) as Task[]
  const allTechnicians = staff ?? []
  const technicians = isManager ? allTechnicians : allTechnicians.filter(isMasterTeamMember)
  const names = Object.fromEntries(allTechnicians.map((s) => [s.id, s.full_name ?? "Technician"]))
  const advisorIds = [...new Set((jobs ?? []).map((j) => j.advisor_id).filter(Boolean))] as string[]
  const { data: advisorRows } = advisorIds.length
    ? await svc.from("profiles").select("id, full_name").in("id", advisorIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const advisorNames = Object.fromEntries((advisorRows ?? []).map((a) => [a.id, a.full_name ?? "Advisor"]))

  // Team workload counts every open task in the workshop, not just mine, so the lead can balance fairly.
  const { data: openAll } = await svc
    .from("technician_tasks")
    .select("technician_id, estimated_hours, worked_seconds, timer_started_at, status")
    .not("status", "in", `(${DONE.join(",")})`)
    .limit(2000)
  const workload = technicians
    .map((t) => {
      const mine = (openAll ?? []).filter((r) => r.technician_id === t.id)
      const hoursLeft = mine.reduce(
        (sum, r) => sum + Math.max(0, Number(r.estimated_hours ?? 0) - liveSeconds(r.worked_seconds, r.timer_started_at) / 3600),
        0,
      )
      return { ...t, open: mine.length, running: mine.some((r) => r.timer_started_at), hoursLeft }
    })
    .sort((a, b) => a.hoursLeft - b.hoursLeft)

  const now = Date.now()
  const qcQueue = tasks.filter((t) => t.status === "repair_completed" || t.status === "qc_pending")
  const overdue = tasks.filter((t) => t.deadline && new Date(t.deadline).getTime() < now && !DONE.includes(t.status))
  const jobLabel = (id: string) => {
    const j = jobs?.find((x) => x.id === id)
    return j ? `${j.job_number ?? "Job"} · ${[j.plate_code, j.plate_number].filter(Boolean).join(" ")}` : "Job"
  }
  const shellUser = await getShellUser()

  return (
    <AppShell user={shellUser}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-balance">Master Technician</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Split each job into tasks, balance the team, and check the work before it goes to final QC.
            </p>
          </div>
          {isManager && (
            <nav aria-label="Scope" className="flex gap-2 text-sm">
              <Link
                href="/master"
                aria-current={!showAll ? "page" : undefined}
                className={`rounded-md border px-3 py-1.5 ${!showAll ? "border-primary bg-primary/10" : "border-border"}`}
              >
                My jobs
              </Link>
              <Link
                href="/master?view=all"
                aria-current={showAll ? "page" : undefined}
                className={`rounded-md border px-3 py-1.5 ${showAll ? "border-primary bg-primary/10" : "border-border"}`}
              >
                All workshop
              </Link>
            </nav>
          )}
        </header>

        <section aria-labelledby="qc-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 id="qc-h" className="text-base font-semibold">
            Ready for technical QC <span className="text-muted-foreground">({qcQueue.length})</span>
          </h2>
          {qcQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting for your check.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {qcQueue.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex flex-col">
                    <Link href={`/technician/tasks/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {jobLabel(t.job_id)} · {names[t.technician_id] ?? "Technician"} ·{" "}
                      {formatDuration(liveSeconds(t.worked_seconds, t.timer_started_at))}
                      {t.rework_count ? ` · reworked ${t.rework_count}×` : ""}
                    </span>
                  </div>
                  <MasterTaskActions taskId={t.id} canQc={canQc} technicianId={t.technician_id} technicians={technicians} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {overdue.length > 0 && (
          <section aria-labelledby="od-h" className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-card p-4">
            <h2 id="od-h" className="text-base font-semibold text-destructive">
              Overdue ({overdue.length})
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {overdue.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex flex-col">
                    <Link href={`/technician/tasks/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {jobLabel(t.job_id)} · {names[t.technician_id] ?? "Technician"} · due{" "}
                      {new Date(t.deadline!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <span className="text-sm">{t.delay_reason ? `Reason: ${t.delay_reason}` : "No delay reason given."}</span>
                  </div>
                  <MasterTaskActions taskId={t.id} canQc={false} technicianId={t.technician_id} technicians={technicians} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <section aria-labelledby="jobs-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:col-span-2">
            <h2 id="jobs-h" className="text-base font-semibold">
              {showAll ? "Jobs with a Master Technician" : "Jobs I lead"} <span className="text-muted-foreground">({jobs?.length ?? 0})</span>
            </h2>
            {(jobs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No open jobs assigned to you as Master Technician.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {(jobs ?? []).map((j) => {
                  const jt = tasks.filter((t) => t.job_id === j.id)
                  const done = jt.filter((t) => DONE.includes(t.status)).length
                  return (
                    <li key={j.id} className="flex flex-col gap-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                          {jobLabel(j.id)} · {[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ")}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {`Advisor: ${j.advisor_id ? advisorNames[j.advisor_id] ?? "—" : "Unassigned"} · `}
                          {jt.length ? `${done}/${jt.length} tasks done` : "No tasks yet — open the job to add your team"}
                          {showAll && j.master_technician_id ? ` · ${names[j.master_technician_id] ?? "—"}` : ""}
                          {j.approval_status !== "approved" ? " · awaiting customer approval" : ""}
                        </span>
                      </div>
                      {jt.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                          {jt.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                              <span>{t.title}</span>
                              <span className="text-muted-foreground">{names[t.technician_id] ?? ""}</span>
                              <TaskStatusBadge status={t.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="wl-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 id="wl-h" className="text-base font-semibold">
              Team workload
            </h2>
            <p className="text-xs text-muted-foreground">Least loaded first. Hours left = estimated minus worked, on open tasks.</p>
            <ul className="flex flex-col gap-2">
              {workload.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`size-2 rounded-full ${w.running ? "bg-primary" : "bg-muted-foreground/40"}`}
                    />
                    {w.full_name ?? "Unnamed"}
                    <span className="sr-only">{w.running ? "(working now)" : "(idle)"}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {w.open} open · {w.hoursLeft.toFixed(1)} h
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </AppShell>
  )
}
