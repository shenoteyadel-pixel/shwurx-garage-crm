"use client"

import * as React from "react"
import { Loader2, Check } from "lucide-react"
import { adviseLabourHours } from "@/lib/actions-labour-advice"

export function LabourHoursAdvice({ itemId, hours, locked }: { itemId: string; hours: number; locked: boolean }) {
  const [value, setValue] = React.useState(String(hours || ""))
  const [saved, setSaved] = React.useState(hours)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const inputId = `hours-${itemId}`
  const dirty = Number(value) !== saved

  if (locked) {
    return <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{saved} hrs</span>
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await adviseLabourHours(itemId, Number(value))
        setSaved(res.hours)
        setValue(String(res.hours))
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save hours.")
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          Hours
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0.25}
          step={0.25}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-20 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending || !value}
          aria-label="Save labour hours"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
