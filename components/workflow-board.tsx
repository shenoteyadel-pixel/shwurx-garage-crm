"use client"

import { useState } from "react"
import Link from "next/link"
import { STAGES, type Stage } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Car } from "lucide-react"
import type { JobCardData } from "@/components/job-card"

export function WorkflowBoard({ jobs }: { jobs: JobCardData[] }) {
  const [showDelivered, setShowDelivered] = useState(false)
  const stages = STAGES.filter((s) => (showDelivered ? true : s.key !== "delivered"))

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDelivered}
            onChange={(e) => setShowDelivered(e.target.checked)}
            className="accent-primary"
          />
          Show delivered
        </label>
      </div>
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = jobs.filter((j) => j.stage === stage.key)
          return (
            <div key={stage.key} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/40">
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", stage.dot)} />
                  <span className="text-sm font-medium">{stage.label}</span>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
                {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">No vehicles</p>
                )}
                {items.map((job) => (
                  <MiniCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniCard({ job }: { job: JobCardData }) {
  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex gap-2.5 rounded-lg border border-border bg-card p-2 transition hover:border-primary/50"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
        {job.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.cover || "/placeholder.svg"} alt={vehicle} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Car className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{vehicle}</div>
        <div className="truncate text-xs text-muted-foreground">{job.customer_name}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {job.plate_number && (
            <span className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
              {job.plate_number}
            </span>
          )}
          {job.approval_status === "approved" && (
            <span className="text-[10px] text-emerald-400">Approved</span>
          )}
          {job.approval_status === "rejected" && <span className="text-[10px] text-red-400">Rejected</span>}
        </div>
      </div>
    </Link>
  )
}
