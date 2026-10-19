"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export type JobSection = {
  id: string
  label: string
  hint?: string
  badge?: string | number
  content: ReactNode
}

export function JobSectionTabs({ sections, initial }: { sections: JobSection[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? sections[0]?.id)
  const current = sections.find((s) => s.id === active) ?? sections[0]

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Job sections"
        className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1"
      >
        {sections.map((s) => {
          const selected = s.id === current?.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`job-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`job-panel-${s.id}`}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {s.label}
              {s.badge !== undefined && s.badge !== 0 && s.badge !== "" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums",
                    selected ? "bg-primary-foreground/20" : "bg-muted text-foreground",
                  )}
                >
                  {s.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {current?.hint && <p className="text-sm text-muted-foreground">{current.hint}</p>}

      {sections.map((s) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`job-panel-${s.id}`}
          aria-labelledby={`job-tab-${s.id}`}
          hidden={s.id !== current?.id}
          className="flex flex-col gap-6"
        >
          {s.content}
        </div>
      ))}
    </div>
  )
}
