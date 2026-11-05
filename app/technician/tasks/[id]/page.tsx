import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, ctxCan } from "@/lib/rbac/context"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { TaskStatusBadge, PriorityText } from "@/components/technician/task-status-badge"
import { TaskClock } from "@/components/technician/task-clock"
import { TaskNotes } from "@/components/technician/task-notes"
import { TaskReportForm, ReportList, type ReportRow } from "@/components/technician/task-report-form"
import { TaskParts, type TaskPart } from "@/components/technician/task-parts"
import { TaskMedia, type TaskMediaItem } from "@/components/technician/task-media"
import { TaskQc } from "@/components/technician/task-qc"
import { formatDuration, statusLabel, type ChecklistItem, type TaskStatus } from "@/lib/technician-tasks"

export const metadata = { title: "Task · SHWURX Auto Service Center" }

const EVENT_LABEL: Record<string, string> = {
  assigned: "Task assigned",
  reassigned: "Reassigned",
  started: "Clock started",
  resumed: "Clock resumed",
  paused: "Clock paused",
  finished: "Clock stopped",
  report: "Technical report submitted",
}

export default async function TaskWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageAccess(["jobs.view_assigned", "jobs.view_all"], "Task")
  const { id } = await params
  const supabase = await createClient()

  const { data: task } = await supabase
    .from("technician_tasks")
    .select(
      "*, job:jobs(id, job_number, vehicle_id, plate_code, plate_number, plate_emirate, vehicle_make, vehicle_model, vehicle_year, vin, mileage, complaint, customer_name)",
    )
    .eq("id", id)
    .maybeSingle()
  if (!task) notFound()

  const job = task.job as {
    id: string
    job_number: string | null
    vehicle_id: string | null
    plate_code: string | null
    plate_number: string | null
    plate_emirate: string | null
    vehicle_make: string | null
    vehicle_model: string | null
    vehicle_year: number | null
    vin: string | null
    mileage: number | null
    complaint: string | null
  }

  const [{ data: events }, { data: reports }, { data: history }, { data: media }, { data: parts }, user] = await Promise.all([
    supabase.from("technician_task_events").select("id, event, detail, actor_id, created_at").eq("task_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("technical_reports").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    job.vehicle_id
      ? supabase.from("technical_reports").select("*").eq("vehicle_id", job.vehicle_id).neq("job_id", job.id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from("vehicle_photos").select("id, url, phase, media_type, caption, created_at").eq("task_id", id).is("deleted_at", null).order("created_at"),
    supabase
      .from("parts_requests")
      .select("id, part_name, quantity, status, urgency, category, oem_number, estimated_availability, created_at")
      .eq("task_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    getShellUser(),
  ])

  // Names only, for people already visible through the RLS-checked records above.
  const peopleIds = [
    task.technician_id,
    task.qc_by,
    ...(events ?? []).map((e) => e.actor_id),
    ...[...(reports ?? []), ...(history ?? [])].map((r) => r.technician_id as string),
  ].filter(Boolean) as string[]
  const { data: people } = peopleIds.length
    ? await createServiceClient().from("profiles").select("id, full_name").in("id", [...new Set(peopleIds)])
    : { data: [] }
  const nameOf = (uid: string | null | undefined) => people?.find((p) => p.id === uid)?.full_name ?? "Staff"
  const withNames = (rows: Record<string, unknown>[] | null) =>
    (rows ?? []).map((r) => ({ ...r, technician_name: nameOf(r.technician_id as string) })) as unknown as ReportRow[]

  const status = task.status as TaskStatus
  const isAssignee = task.technician_id === ctx.userId
  const isManager = ctxCan(ctx, "jobs.assign")
  const canWork = isAssignee || isManager
  const locked = !canWork || status === "qc_approved" || (!isManager && status === "qc_pending")
  const canQc = ctxCan(ctx, "jobs.qc_approve") && !isAssignee && status === "qc_pending"
  const plate = [job.plate_emirate, job.plate_code, job.plate_number].filter(Boolean).join(" ")

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <Link href="/technician" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Tasks
        </Link>

        <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Job {job.job_number}
                {task.trade ? ` · ${task.trade}` : ""} · assigned to {nameOf(task.technician_id)}
              </span>
              <h1 className="text-xl font-semibold text-balance">{task.title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <PriorityText priority={task.priority} />
              <TaskStatusBadge status={status} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Vehicle</dt>
              <dd>{[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Plate</dt>
              <dd>{plate || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mileage</dt>
              <dd>{job.mileage ? `${Number(job.mileage).toLocaleString("en-GB")} km` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Deadline</dt>
              <dd>{task.deadline ? new Date(task.deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd>
            </div>
          </dl>
          {(job.complaint || task.description) && (
            <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
              {job.complaint && (
                <p>
                  <span className="text-muted-foreground">Customer complaint: </span>
                  {job.complaint}
                </p>
              )}
              {task.description && (
                <p className="whitespace-pre-wrap">
                  <span className="text-muted-foreground">Instructions: </span>
                  {task.description}
                </p>
              )}
            </div>
          )}
          {status === "qc_rejected" && task.qc_note && (
            <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
              <span className="font-medium">Rework required ({nameOf(task.qc_by)}): </span>
              {task.qc_note}
            </p>
          )}
        </header>

        {canQc && <TaskQc taskId={id} />}

        {canWork ? (
          <TaskClock
            taskId={id}
            status={status}
            workedSeconds={task.worked_seconds}
            timerStartedAt={task.timer_started_at}
            locked={locked}
            hasReport={(reports ?? []).length > 0}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Time logged: {formatDuration(task.worked_seconds)}</p>
        )}

        <TaskNotes
          taskId={id}
          locked={locked}
          initial={{
            checklist: (task.checklist as ChecklistItem[]) ?? [],
            findings: task.findings ?? "",
            fault_codes: task.fault_codes ?? "",
            comments: task.comments ?? "",
            recommendations: task.recommendations ?? "",
          }}
        />

        <TaskMedia taskId={id} media={(media ?? []) as TaskMediaItem[]} locked={locked} />
        <TaskParts taskId={id} parts={(parts ?? []) as TaskPart[]} locked={locked} />
        <TaskReportForm taskId={id} locked={locked} defaults={{ complaint: job.complaint ?? "", fault_codes: task.fault_codes ?? "" }} />
        <ReportList title="Reports on this task" reports={withNames(reports)} />
        <ReportList title="Previous reports on this vehicle" reports={withNames(history as Record<string, unknown>[])} />

        <section aria-labelledby="history-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 id="history-heading" className="text-base font-semibold">
            Progress history
          </h2>
          <ol className="flex flex-col gap-2">
            {(events ?? []).map((e) => {
              const d = (e.detail ?? {}) as Record<string, string | number | null>
              const label =
                e.event === "status" ? `${statusLabel(String(d.from))} → ${statusLabel(String(d.to))}` : (EVENT_LABEL[e.event] ?? e.event)
              return (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {label}
                    {e.event === "finished" || e.event === "paused" ? ` · ${formatDuration(Number(d.worked_seconds ?? 0))} total` : ""}
                    {e.event === "status" && d.note ? ` · "${d.note}"` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {nameOf(e.actor_id)} · {new Date(e.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </AppShell>
  )
}
