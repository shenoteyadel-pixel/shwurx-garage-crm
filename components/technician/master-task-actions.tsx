"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Select } from "@/components/ui"
import { decideTaskQc } from "@/lib/actions-technician"
import { reassignTask } from "@/lib/actions-master-tech"

type Mode = null | "reject" | "reassign"

export function MasterTaskActions({
  taskId,
  canQc,
  technicianId,
  technicians,
}: {
  taskId: string
  canQc: boolean
  technicianId: string
  technicians: { id: string; full_name: string | null }[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [note, setNote] = useState("")
  const [target, setTarget] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setMode(null)
        setNote("")
        router.refresh()
      } else setError(res.error ?? "Something went wrong.")
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canQc && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => decideTaskQc(taskId, true, ""))}>
              Pass QC
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(mode === "reject" ? null : "reject")}>
              Send back
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(mode === "reassign" ? null : "reassign")}>
          Reassign
        </Button>
      </div>

      {mode && (
        <form
          className="flex flex-wrap items-end gap-2"
          action={() =>
            run(() => (mode === "reject" ? decideTaskQc(taskId, false, note) : reassignTask(taskId, target, note)))
          }
        >
          {mode === "reassign" && (
            <Select aria-label="New technician" required value={target} onChange={(e) => setTarget(e.target.value)} className="w-48">
              <option value="" disabled>
                Move to…
              </option>
              {technicians
                .filter((t) => t.id !== technicianId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name ?? "Unnamed"}
                  </option>
                ))}
            </Select>
          )}
          <Input
            aria-label={mode === "reject" ? "What needs rework" : "Reason for reassignment"}
            required
            minLength={mode === "reassign" ? 5 : 1}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "reject" ? "What needs rework?" : "Reason"}
            className="min-w-48 flex-1"
          />
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
