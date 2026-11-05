"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Textarea } from "@/components/ui"
import { decideTaskQc } from "@/lib/actions-technician"

export function TaskQc({ taskId }: { taskId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  function decide(approve: boolean) {
    setError(null)
    start(async () => {
      const res = await decideTaskQc(taskId, approve, note)
      if (!res.ok) setError(res.error)
      else {
        setNote("")
        router.refresh()
      }
    })
  }

  return (
    <section aria-labelledby="qc-heading" className="flex flex-col gap-3 rounded-xl border border-sky-500/40 bg-card p-4">
      <h2 id="qc-heading" className="text-base font-semibold">
        Quality control
      </h2>
      <label htmlFor="qc-note" className="text-sm text-muted-foreground">
        QC note (required to send back for rework)
      </label>
      <Textarea id="qc-note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={pending} onClick={() => decide(true)}>
          Approve work
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => decide(false)}>
          Send back for rework
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}
