"use client"

import * as React from "react"
import { addPart } from "@/lib/actions"
import { Button, Card, Input } from "@/components/ui"
import { PART_STATUSES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Package, Plus, Loader2 } from "lucide-react"

type Part = { id: string; part_name: string; quantity: number; status: string; notes: string | null }
type CatalogOption = { name: string; part_number: string; source: "stock" | "quote" }

export function TechPartsRequest({
  jobId,
  parts,
  catalog,
}: {
  jobId: string
  parts: Part[]
  catalog: CatalogOption[]
}) {
  const [saving, setSaving] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const listId = React.useId()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      await addPart(jobId, new FormData(e.currentTarget))
      formRef.current?.reset()
      setFeedback({ tone: "ok", text: "Request sent to the parts team." })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Could not send the request." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Package className="h-4 w-4 text-primary" /> Parts for diagnosis &amp; repair
        </h2>
        <span className="text-xs text-muted-foreground">{parts.length} requested</span>
      </div>

      {parts.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-2">
          {parts.map((p) => {
            const st = PART_STATUSES.find((s) => s.value === p.status)
            return (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {p.part_name} <span className="text-muted-foreground">{"× "}{Number(p.quantity)}</span>
                  </div>
                  {p.notes && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.notes}</p>}
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", st?.chip)}>
                  {st?.label ?? p.status}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mb-5 text-sm text-muted-foreground">No parts requested for this job yet.</p>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Part needed
            <Input name="part_name" list={listId} required maxLength={200} placeholder="Search stock or type a part name" />
            <datalist id={listId}>
              {catalog.map((c) => (
                <option key={`${c.name}|${c.part_number}`} value={c.name}>
                  {[c.part_number, c.source === "stock" ? "In stock" : null].filter(Boolean).join(" · ")}
                </option>
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Qty
            <Input name="quantity" type="number" min={1} max={999} defaultValue={1} required />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Reason / note
          <Input name="notes" maxLength={1000} placeholder="e.g. Needed to confirm diagnosis, worn pads found" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {feedback ? (
            <p
              role="status"
              className={cn("text-xs", feedback.tone === "ok" ? "text-emerald-400" : "text-destructive")}
            >
              {feedback.text}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">The parts team is notified and will update the status.</p>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Request part
          </Button>
        </div>
      </form>
    </Card>
  )
}
