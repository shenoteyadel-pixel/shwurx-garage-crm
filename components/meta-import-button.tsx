"use client"

import { useState, useTransition } from "react"
import { Download, Loader2 } from "lucide-react"
import { importMetaLeads, type MetaImportState } from "@/lib/actions-meta-import"

export function MetaImportButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<MetaImportState | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => startTransition(async () => setState(await importMetaLeads()))}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {pending ? "Importing…" : "Import existing Meta leads"}
      </button>
      <p role="status" aria-live="polite" className="text-xs leading-relaxed">
        {state?.ok === true ? (
          <span className="text-muted-foreground">
            {state.pageName ? `${state.pageName}: ` : ""}
            {state.found} lead{state.found === 1 ? "" : "s"} found in {state.forms} form{state.forms === 1 ? "" : "s"}, {state.created} new added
            {state.errors ? `, ${state.errors} failed` : ""}.
          </span>
        ) : state?.ok === false ? (
          <span className="text-destructive">{state.error}</span>
        ) : null}
      </p>
    </div>
  )
}
