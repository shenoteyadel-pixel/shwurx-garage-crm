"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { restoreRecord } from "@/lib/actions-recycle-bin"
import { closeReasonLabel } from "@/lib/job-close"
import type { ClosedJobRow } from "@/lib/history-data"

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

function RestoreButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            try {
              await restoreRecord("jobs", id)
              router.push(`/jobs/${id}`)
            } catch (e: any) {
              setError(e?.message ?? "Restore failed")
            }
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 px-3 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        {pending ? "Restoring…" : "Restore job card"}
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export function HistoryClosedJobs({ rows, canRestore }: { rows: ClosedJobRow[]; canRestore: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">{r.jobNumber}</span>
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {closeReasonLabel(r.reason)}
              </span>
            </div>
            <p className="text-sm">
              <span className="font-medium">{r.customerName || "Unknown customer"}</span>
              {r.customerMobile ? <span className="text-muted-foreground"> · {r.customerMobile}</span> : null}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.vehicle}
              {r.plate ? ` · ${r.plate}` : ""}
              {r.vin ? ` · VIN ${r.vin}` : ""}
            </p>
            {r.note ? <p className="text-pretty text-sm italic text-muted-foreground">{`“${r.note}”`}</p> : null}
            <p className="text-xs text-muted-foreground">
              Opened {fmt(r.openedAt)} · Closed {fmt(r.closedAt)} by {r.closedBy}
            </p>
          </div>
          {canRestore ? <RestoreButton id={r.id} /> : null}
        </li>
      ))}
    </ul>
  )
}
