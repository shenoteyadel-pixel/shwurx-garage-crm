"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw, UserCog, Wrench } from "lucide-react"
import { Button, Card, Select, Textarea } from "@/components/ui"
import { createComebackJob, setComebackResponsibility } from "@/lib/actions-comeback"
import {
  COMEBACK_RESPONSIBILITIES,
  blamesAdvisor,
  blamesTechnician,
  comebackResponsibilityLabel,
} from "@/lib/comeback"
import { cn } from "@/lib/utils"

export type ComebackInfo = {
  originalId: string
  originalNumber: string | null
  reason: string | null
  responsibility: string | null
  note: string | null
  advisorName: string | null
  technicianName: string | null
}

export function ComebackBanner({ jobId, info, isOwner }: { jobId: string; info: ComebackInfo; isOwner: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(info.responsibility ?? "none")
  const [note, setNote] = React.useState(info.note ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await setComebackResponsibility(jobId, value, note)
        setEditing(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save")
      }
    })
  }

  const advisorAtFault = blamesAdvisor(info.responsibility)
  const techAtFault = blamesTechnician(info.responsibility)

  return (
    <Card className="mb-6 border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <div>
            <p className="font-semibold text-foreground">
              Comeback job card
              {info.originalNumber && (
                <>
                  {" "}
                  — returned from{" "}
                  <Link href={`/jobs/${info.originalId}`} className="font-mono text-primary underline-offset-2 hover:underline">
                    {info.originalNumber}
                  </Link>
                </>
              )}
            </p>
            {info.reason && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{info.reason}</p>}
          </div>
        </div>
        <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-500">
          Responsible: {comebackResponsibilityLabel(info.responsibility)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            advisorAtFault ? "border-red-500/50 bg-red-500/10 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          <UserCog className="h-4 w-4" aria-hidden />
          <span>Original advisor: {info.advisorName ?? "—"}</span>
          {advisorAtFault && <span className="ml-auto text-xs font-semibold text-red-500">At fault</span>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            techAtFault ? "border-red-500/50 bg-red-500/10 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          <Wrench className="h-4 w-4" aria-hidden />
          <span>Original technician: {info.technicianName ?? "—"}</span>
          {techAtFault && <span className="ml-auto text-xs font-semibold text-red-500">At fault</span>}
        </div>
      </div>

      {info.note && !editing && <p className="mt-3 text-sm text-muted-foreground">Owner note: {info.note}</p>}

      {isOwner && !editing && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
          Set responsibility
        </Button>
      )}

      {isOwner && editing && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Who is responsible?</span>
            <Select value={value} onChange={(e) => setValue(e.target.value)}>
              {COMEBACK_RESPONSIBILITIES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Note (optional, sent to the responsible staff)</span>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function CreateComebackButton({ jobId, isOwner }: { jobId: string; isOwner: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createComebackJob(jobId, formData)
      } catch (e) {
        // redirect() throws a control-flow error that must propagate.
        if (e && typeof e === "object" && "digest" in e && String((e as any).digest).startsWith("NEXT_REDIRECT")) throw e
        setError(e instanceof Error ? e.message : "Could not create comeback")
      }
    })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        Car came back
      </Button>
    )
  }

  return (
    <Card className="mb-6 w-full p-4">
      <form action={submit} className="grid gap-3">
        <p className="font-semibold text-foreground">Open a comeback job card</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A new job card is opened for the same car and linked to this one. The advisor and technician from this job are
          recorded so responsibility can be tracked.
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Why did the car come back?</span>
          <Textarea name="reason" rows={3} required placeholder="e.g. Same noise from front left after brake job" />
        </label>
        {isOwner ? (
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Who is responsible?</span>
            <Select name="responsibility" defaultValue="none">
              {COMEBACK_RESPONSIBILITIES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">The owner will review and set who is responsible.</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Open comeback job card
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
