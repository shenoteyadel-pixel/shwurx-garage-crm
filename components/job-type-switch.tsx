"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { setJobType } from "@/lib/actions-full-inspection"
import { JOB_TYPES, type JobType } from "@/lib/full-inspection-config"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export function JobTypeSwitch({ jobId, value, canEdit }: { jobId: string; value: JobType; canEdit: boolean }) {
  const router = useRouter()
  const [current, setCurrent] = React.useState<JobType>(value)
  const [pending, startTransition] = React.useTransition()

  function choose(next: JobType) {
    if (next === current || !canEdit) return
    const previous = current
    setCurrent(next)
    startTransition(async () => {
      try {
        await setJobType(jobId, next)
        router.refresh()
      } catch {
        setCurrent(previous)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Job type" className="flex rounded-lg border border-border bg-card p-1">
        {JOB_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={current === t.value}
            disabled={!canEdit || pending}
            onClick={() => choose(t.value)}
            title={t.description}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed",
              current === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
    </div>
  )
}
