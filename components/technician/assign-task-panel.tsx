"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Select, Textarea } from "@/components/ui"
import { TASK_PRIORITIES, formatDuration, liveSeconds } from "@/lib/technician-tasks"
import { assignTechnicianTask } from "@/lib/actions-technician"
import { TaskStatusBadge } from "@/components/technician/task-status-badge"
import { TRADES as TRADE_OPTIONS, tradeFromTitle } from "@/lib/trades"

export type JobTask = {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  worked_seconds: number
  timer_started_at: string | null
  technician_name: string
  estimated_hours?: number | null
  chargeable?: boolean
}

const TRADES = ["Mechanical", "Electrical", "Body / denting", "Paint", "AC", "Diagnosis", "Detailing"]

export function AssignTaskPanel({
  jobId,
  tasks,
  technicians,
  canAssign,
  approved = true,
  trades = TRADES,
}: {
  jobId: string
  tasks: JobTask[]
  technicians: { id: string; full_name: string | null; job_title: string | null }[]
  canAssign: boolean
  approved?: boolean
  trades?: string[]
}) {
  const groups = TRADE_OPTIONS.map((t) => ({
    ...t,
    people: technicians.filter((p) => tradeFromTitle(p.job_title) === t.value),
  })).filter((g) => g.people.length)
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
                    {t.estimated_hours ? ` of ${t.estimated_hours} h` : ""}
                    {t.chargeable && !approved ? " · waiting for customer approval" : ""}
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
          <fieldset className="flex flex-col gap-2 md:col-span-2">
            <legend className="mb-1 text-sm font-medium">Technicians</legend>
            <p className="text-xs text-muted-foreground">Pick one or more. Each person gets their own task and timer.</p>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active technicians available for this work.</p>
            ) : (
              groups.map((g) => (
                <div key={g.value} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</span>
                  <div className="flex flex-wrap gap-2">
                    {g.people.map((t) => (
                      <label
                        key={t.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                      >
                        <input type="checkbox" name="technician_id" value={t.id} className="accent-primary" />
                        {t.full_name ?? "Unnamed"}
                        {t.job_title ? <span className="text-muted-foreground">{t.job_title}</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </fieldset>
          <Field label="Trade" htmlFor="t-trade">
            <Select id="t-trade" name="trade" defaultValue={trades[0]}>
              {trades.map((t) => (
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
          <Field label="Estimated hours" htmlFor="t-hours">
            <Input id="t-hours" name="estimated_hours" type="number" min={0} max={500} step={0.25} inputMode="decimal" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="chargeable" defaultChecked className="accent-primary" />
            Chargeable repair work
            <span className="text-xs text-muted-foreground">
              {approved ? "" : "(can start only after customer approval)"}
            </span>
          </label>
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
