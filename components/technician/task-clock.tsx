"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pause, Play, CheckCircle2, Send } from "lucide-react"
import { Button, Select } from "@/components/ui"
import { formatDuration, liveSeconds, TECH_STATUSES, statusLabel, type TaskStatus } from "@/lib/technician-tasks"
import { pauseTaskTimer, setTaskStatus, startTaskTimer, submitTaskForQc } from "@/lib/actions-technician"

export function TaskClock({
  taskId,
  status,
  workedSeconds,
  timerStartedAt,
  locked,
  hasReport,
}: {
  taskId: string
  status: TaskStatus
  workedSeconds: number
  timerStartedAt: string | null
  locked: boolean
  hasReport: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const running = Boolean(timerStartedAt)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) setError(res.error ?? "Something went wrong.")
      router.refresh()
    })
  }

  const done = status === "repair_completed"

  return (
    <section aria-label="Work clock" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Time on this task</span>
          <span
            className={running ? "font-mono text-4xl font-semibold tabular-nums text-primary" : "font-mono text-4xl font-semibold tabular-nums"}
            aria-live="off"
          >
            {formatDuration(liveSeconds(workedSeconds, timerStartedAt, now))}
          </span>
          <span className="text-xs text-muted-foreground">{running ? "Clock running" : "Clock stopped"}</span>
        </div>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button variant="secondary" size="lg" disabled={pending} onClick={() => run(() => pauseTaskTimer(taskId))}>
                <Pause className="h-5 w-5" aria-hidden /> Pause
              </Button>
            ) : (
              <Button size="lg" disabled={pending || done} onClick={() => run(() => startTaskTimer(taskId))}>
                <Play className="h-5 w-5" aria-hidden /> {workedSeconds > 0 ? "Resume" : "Start job"}
              </Button>
            )}
            {!done ? (
              <Button variant="success" size="lg" disabled={pending} onClick={() => run(() => setTaskStatus(taskId, "repair_completed"))}>
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Finish repair
              </Button>
            ) : (
              <Button
                variant="success"
                size="lg"
                disabled={pending || !hasReport}
                title={hasReport ? undefined : "Submit a technical report first"}
                onClick={() => run(() => submitTaskForQc(taskId))}
              >
                <Send className="h-5 w-5" aria-hidden /> Submit for QC
              </Button>
            )}
          </div>
        )}
      </div>

      {!locked && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Status
          <Select
            className="w-auto min-w-48"
            value={TECH_STATUSES.includes(status) ? status : ""}
            disabled={pending}
            onChange={(e) => run(() => setTaskStatus(taskId, e.target.value as TaskStatus))}
          >
            {!TECH_STATUSES.includes(status) && <option value="">{statusLabel(status)}</option>}
            {TECH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          {done && !hasReport && <span className="text-xs text-amber-300">Add the technical report below, then submit for QC.</span>}
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}
