"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { RefreshCw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export function ControlCenterHeader({ generatedAt }: { generatedAt: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const when = new Date(generatedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">AI Control Center</h1>
          <p className="text-xs text-muted-foreground">Owner-only intelligence · analysed {when}</p>
        </div>
      </div>
      <button
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Re-analysing…" : "Re-analyse"}
      </button>
    </div>
  )
}
