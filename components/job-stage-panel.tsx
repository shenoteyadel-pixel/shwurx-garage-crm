import { createClient } from "@/lib/supabase/server"
import { STAGE_MAP, type Stage } from "@/lib/constants"
import { Clock, UserRound, ArrowRight, History, ShieldAlert } from "lucide-react"

type StageEvent = {
  id: string
  from_stage: string | null
  to_stage: string
  actor_id: string | null
  source: string
  reason: string | null
  override: boolean
  override_checks: string[] | null
  seconds_in_from_stage: number | null
  created_at: string
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Job page",
  car_flow: "Car Flow",
  payment: "Payment",
  quotation: "Quotation saved",
  approval: "Approval sent",
  system: "System",
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return null
  const h = Math.floor(seconds / 3600)
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h >= 1) return `${h}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.max(1, Math.floor(seconds / 60))}m`
}

function stageLabel(s: string | null) {
  if (!s) return "—"
  return STAGE_MAP[s as Stage]?.label ?? s
}

export async function JobStagePanel({
  job,
}: {
  job: {
    id: string
    stage: string
    stage_entered_at: string | null
    stage_due_at: string | null
    stage_owner_id: string | null
    stage_status: string | null
    blocked_reason: string | null
    next_action: string | null
  }
}) {
  const supabase = await createClient()
  const { data: eventRows } = await supabase
    .from("job_stage_events")
    .select("id, from_stage, to_stage, actor_id, source, reason, override, override_checks, seconds_in_from_stage, created_at")
    .eq("job_id", job.id)
    .order("created_at", { ascending: false })
    .limit(30)
  const events = (eventRows ?? []) as StageEvent[]

  const peopleIds = [...new Set([job.stage_owner_id, ...events.map((e) => e.actor_id)].filter(Boolean))] as string[]
  const { data: people } = peopleIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", peopleIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameOf = (id: string | null) => (id ? people?.find((p) => p.id === id)?.full_name ?? "Staff" : "System")

  const now = Date.now()
  const due = job.stage_due_at ? new Date(job.stage_due_at).getTime() : null
  const overdue = due != null && job.stage !== "delivered" && due < now
  const timeIn = job.stage_entered_at ? formatDuration(Math.floor((now - new Date(job.stage_entered_at).getTime()) / 1000)) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Stage owner
          </span>
          <span className="text-sm font-medium">{job.stage_owner_id ? nameOf(job.stage_owner_id) : "Not assigned"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> In this stage
          </span>
          <span className="text-sm font-medium">
            {timeIn ?? "—"}
            {due != null && job.stage !== "delivered" && (
              <span className={overdue ? "ml-2 text-destructive" : "ml-2 text-muted-foreground"}>
                {overdue ? "· overdue" : `· due ${new Date(due).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}`}
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Next action
          </span>
          <span className="text-pretty text-sm font-medium">{job.next_action ?? "—"}</span>
        </div>
      </div>

      {job.stage_status === "blocked" && job.blocked_reason && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {job.blocked_reason}
        </p>
      )}

      <details className="group">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Stage history ({events.length})
        </summary>
        {events.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No stage moves recorded yet. History starts from today.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 border-l border-border pl-3 text-xs leading-relaxed">
                <span>
                  <span className="text-muted-foreground">{stageLabel(e.from_stage)}</span>
                  {" → "}
                  <span className="font-medium">{stageLabel(e.to_stage)}</span>
                  {e.seconds_in_from_stage != null && (
                    <span className="text-muted-foreground"> · after {formatDuration(e.seconds_in_from_stage)}</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {nameOf(e.actor_id)} · {SOURCE_LABEL[e.source] ?? e.source} ·{" "}
                  {new Date(e.created_at).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {e.override && (
                  <span className="text-amber-400">
                    Override{e.override_checks?.length ? ` (${e.override_checks.join(", ")})` : ""}: {e.reason}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  )
}
