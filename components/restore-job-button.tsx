"use client"

import * as React from "react"
import { RotateCcw, Loader2 } from "lucide-react"
import { restoreRecord } from "@/lib/actions-recycle-bin"
import { Button } from "@/components/ui"

export function RestoreJobButton({ id }: { id: string }) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-300">{error}</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            try {
              await restoreRecord("jobs", id)
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not restore.")
            }
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        Restore
      </Button>
    </div>
  )
}
