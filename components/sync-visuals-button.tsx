"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { refreshAllVehicleImages } from "@/lib/actions"
import { refreshAllMasterVehicleImages } from "@/lib/actions-customers"
import { cn } from "@/lib/utils"

export function SyncVisualsButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function onClick() {
    setMsg(null)
    startTransition(async () => {
      try {
        // Master vehicle records are the source of truth — refresh only those
        // that are missing/failed (custom & valid cached images are preserved),
        // then run a job-level pass for any legacy job-only records.
        const master = await refreshAllMasterVehicleImages({ onlyMissing: true })
        const jobs = await refreshAllVehicleImages()
        setMsg(`Updated ${master.updated} vehicles · ${jobs.found}/${jobs.total} job cards`)
        router.refresh()
      } catch {
        setMsg("Refresh failed — try again")
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Refresh all photos"}
      </button>
    </div>
  )
}
