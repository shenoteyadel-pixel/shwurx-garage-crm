"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Field, Input, Select } from "@/components/ui"
import { assignMasterTechnician } from "@/lib/actions-master-tech"

type HistoryRow = {
  id: string
  from_technician_id: string | null
  to_technician_id: string
  reason: string | null
  is_override: boolean
  actor_id: string | null
  created_at: string
}

export function MasterTechCard({
  jobId,
  masterId,
  masterAssignedAt,
  technicians,
  names,
  history,
  canPick,
}: {
  jobId: string
  masterId: string | null
  masterAssignedAt: string | null
  technicians: { id: string; full_name: string | null; job_title: string | null }[]
  names: Record<string, string>
  history: HistoryRow[]
  canPick: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [choice, setChoice] = useState(masterId ?? "")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const needsReason = Boolean(masterId) && choice !== masterId
  const name = (id: string | null) => (id ? (names[id] ?? "Technician") : "—")

  return (
    <section aria-labelledby="master-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 id="master-heading" className="text-base font-semibold">
            Master Technician
          </h2>
          <p className="text-sm text-muted-foreground">
            {masterId ? (
              <>
                <span className="font-medium text-foreground">{name(masterId)}</span>
                {masterAssignedAt
                  ? ` · since ${new Date(masterAssignedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                  : ""}
              </>
            ) : (
              "Not assigned yet. The Master Technician leads the job, splits it into tasks and does technical QC."
            )}
          </p>
        </div>
        {canPick && (
          <Button size="sm" variant={editing ? "outline" : masterId ? "outline" : "primary"} onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : masterId ? "Change" : "Assign"}
          </Button>
        )}
      </div>

      {editing && (
        <form
          className="grid gap-3 border-t border-border pt-3 md:grid-cols-2"
          action={() => {
            setError(null)
            start(async () => {
              const res = await assignMasterTechnician(jobId, choice, reason)
              if (res.ok) {
                setEditing(false)
                setReason("")
                router.refresh()
              } else setError(res.error)
            })
          }}
        >
          <Field label="Technician" htmlFor="mt-tech">
            <Select id="mt-tech" required value={choice} onChange={(e) => setChoice(e.target.value)}>
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
          {needsReason && (
            <Field label="Reason for change" htmlFor="mt-reason">
              <Input
                id="mt-reason"
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Electrical fault, moving to specialist"
              />
            </Field>
          )}
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={pending || !choice || choice === masterId}>
              {pending ? "Saving…" : "Save and notify"}
            </Button>
            {error && (
              <span role="alert" className="text-sm text-destructive">
                {error}
              </span>
            )}
          </div>
        </form>
      )}

      {history.length > 0 && (
        <details className="border-t border-border pt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Assignment history ({history.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col">
                <span>
                  {h.from_technician_id ? `${name(h.from_technician_id)} → ` : ""}
                  <span className="font-medium">{name(h.to_technician_id)}</span>
                  {h.is_override ? " · manager override" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  {h.actor_id ? ` · by ${name(h.actor_id)}` : " · automatic"}
                  {h.reason ? ` · ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
