"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { refreshVehicleImage } from "@/lib/actions"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export function RefreshVehicleImageButton({
  jobId,
  source,
}: {
  jobId: string
  source?: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  async function onClick() {
    setPending(true)
    setMsg(null)
    try {
      const res = await refreshVehicleImage(jobId)
      setMsg(res.found ? "Image updated" : "No image found")
      router.refresh()
    } catch {
      setMsg("Failed")
    } finally {
      setPending(false)
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={source === "carsxe" ? "Real image via CarsXE — click to refresh" : "Fetch a real vehicle image"}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
      {msg ?? (pending ? "Fetching…" : "Refresh image")}
    </button>
  )
}
