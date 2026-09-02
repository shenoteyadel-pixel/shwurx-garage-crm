"use client"

import { useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { refreshAllVehicleImages } from "@/lib/actions"
import { cn } from "@/lib/utils"

export function SyncVisualsButton() {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function onClick() {
    setMsg(null)
    startTransition(async () => {
      try {
        const r = await refreshAllVehicleImages()
        setMsg(`Synced ${r.found}/${r.total} vehicle images`)
      } catch {
        setMsg("Sync failed — try again")
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
        {pending ? "Syncing…" : "Sync visuals"}
      </button>
    </div>
  )
}
