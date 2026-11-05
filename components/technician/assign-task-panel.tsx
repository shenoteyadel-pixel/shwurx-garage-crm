"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import { TASK_PRIORITIES, formatDuration, liveSeconds } from "@/lib/technician-tasks"
import { assignTechnicianTask } from "@/lib/actions-technician"
import { TaskStatusBadge } from "@/components/technician/task-status-badge"

export type JobTask = {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  worked_seconds: number
  timer_started_at: string | null
  technician_name: string
}

const TRADES = ["Mechanical", "Electrical", "Body / denting", "Paint", "AC", "Diagnosis", "Detailing"]

export function AssignTaskPanel({
  jobId,
  tasks,
  technicians,
  canAssign,
}: {
  jobId: string
  tasks: JobTask[]
  technicians: { id: string; full_name: string | null; job_title: string | null }[]
  canAssign: boolean
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <section aria-labelledby="tasks-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tasks-heading" className="text-base font-semibold">
          Technician tasks
        </h2>
        {canAssign && (
          <Button size="sm" variant={open ? "outline" : "primary"} onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Assign task"}
          </Button>
        )}
      </div>

      {tasks.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link href={`/technician/tasks/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-primary">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.technician_name} · {formatDuration(liveSeconds(t.worked_seconds, t.timer_started_at))}
                    {t.deadline ? ` · due ${new Date(t.deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                  </span>
                </div>
                <TaskStatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>
      )}

      {canAssign && open && (
        <form
          ref={formRef}
          className="grid gap-3 border-t border-border pt-3 md:grid-cols-2"
          action={(fd) => {
            setError(null)
            start(async () => {
              const res = await assignTechnicianTask(jobId, fd)
              if (res.ok) {
                formRef.current?.reset()
                setOpen(false)
                router.refresh()
              } else setError(res.error)
            })
          }}
        >
          <Field label="Technician" htmlFor="t-tech">
            <Select id="t-tech" name="technician_id" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name ?? "Unnamed"}
                  {t.job_title ? ` — ${t.job_title}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trade" htmlFor="t-trade">
            <Select id="t-trade" name="trade" defaultValue="Mechanical">
              {TRADES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Task" htmlFor="t-title" className="md:col-span-2">
            <Input id="t-title" name="title" required maxLength={200} placeholder="e.g. Diagnose engine misfire" />
          </Field>
          <Field label="Instructions" htmlFor="t-desc" className="md:col-span-2">
            <Textarea id="t-desc" name="description" rows={2} maxLength={4000} />
          </Field>
          <Field label="Priority" htmlFor="t-pri">
            <Select id="t-pri" name="priority" defaultValue="normal">
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline" htmlFor="t-dead">
            <Input id="t-dead" name="deadline" type="datetime-local" />
          </Field>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Assigning…" : "Assign and notify"}
            </Button>
            {error && (
              <span role="alert" className="text-sm text-red-300">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
