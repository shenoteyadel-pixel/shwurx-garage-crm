"use client"

import * as React from "react"
import { updateStage } from "@/lib/actions"
import { STAGES, STAGE_ORDER, type Stage } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export function StageStepper({ jobId, stage }: { jobId: string; stage: Stage }) {
  const [pending, setPending] = React.useState<Stage | null>(null)
  const currentIndex = STAGE_ORDER.indexOf(stage)

  async function go(target: Stage) {
    setPending(target)
    try {
      await updateStage(jobId, target)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-center gap-1">
        {STAGES.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <React.Fragment key={s.key}>
              <button
                onClick={() => go(s.key)}
                disabled={pending !== null}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                title={`Move to ${s.label}`}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-primary-foreground" : s.dot)} />
                )}
                {pending === s.key ? "..." : s.label}
              </button>
              {i < STAGES.length - 1 && <span className="h-px w-3 shrink-0 bg-border" />}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
