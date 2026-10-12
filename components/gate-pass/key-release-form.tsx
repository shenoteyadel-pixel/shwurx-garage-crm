"use client"

import { useState, useTransition } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button, Input, Label } from "@/components/ui"
import { releaseKeys } from "@/lib/actions-gate-pass"

export function KeyReleaseForm({ passId, customerName }: { passId: string; customerName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-3"
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          const res = await releaseKeys(passId, fd)
          if (!res.ok) setError(res.error ?? "Could not release keys.")
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`code-${passId}`}>Last 4 digits on pass</Label>
          <Input
            id={`code-${passId}`}
            name="pass_code"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            placeholder="0000"
            className="font-mono tracking-widest"
          />
        </div>
        <div>
          <Label htmlFor={`to-${passId}`}>Keys collected by</Label>
          <Input id={`to-${passId}`} name="released_to" defaultValue={customerName} required />
        </div>
      </div>
      <div>
        <Label htmlFor={`note-${passId}`}>Note (optional)</Label>
        <Input id={`note-${passId}`} name="release_note" placeholder="e.g. Collected by driver, ID checked" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="success" disabled={pending} className="w-full sm:w-auto sm:self-end">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
        Release keys
      </Button>
    </form>
  )
}
