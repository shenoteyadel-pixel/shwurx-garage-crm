"use client"

import * as React from "react"
import { addPart, updatePart, deletePart, sendPartsToQuotation } from "@/lib/actions"
import { Button, Card, Input, Select } from "@/components/ui"
import { PART_STATUSES } from "@/lib/constants"
import { formatCurrency, cn } from "@/lib/utils"
import { Plus, Trash2, Package, FileUp, Loader2 } from "lucide-react"

type Part = {
  id: string
  part_name: string
  quantity: number
  status: string
  supplier: string | null
  cost: number | null
  notes: string | null
}

export function PartsManager({
  jobId,
  parts,
  locked = false,
}: {
  jobId: string
  parts: Part[]
  locked?: boolean
}) {
  const [adding, setAdding] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null)

  const partsTotal = parts.reduce((sum, p) => sum + (p.cost != null ? p.cost * p.quantity : 0), 0)

  async function handleSend() {
    setSending(true)
    setFeedback(null)
    try {
      await sendPartsToQuotation(jobId)
      setFeedback({ tone: "ok", text: "Parts added to the quotation. Scroll up to review and send for approval." })
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Could not add parts to the quotation." })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Package className="h-4 w-4" /> Parts Request
        </h2>
        <div className="flex items-center gap-2">
          {parts.length > 0 && !locked && (
            <Button type="button" size="sm" onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              Send to quotation
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3.5 w-3.5" /> Add part
          </Button>
        </div>
      </div>

      {feedback && (
        <p
          className={cn(
            "mb-3 rounded-lg border px-3 py-2 text-xs",
            feedback.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          )}
        >
          {feedback.text}
        </p>
      )}

      {adding && (
        <form
          action={async (fd) => {
            await addPart(jobId, fd)
            setAdding(false)
          }}
          className="mb-4 grid gap-2 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-2"
        >
          <Input name="part_name" required placeholder="Part name" className="sm:col-span-2" />
          <Input name="quantity" type="number" min="1" defaultValue="1" placeholder="Qty" />
          <Input name="supplier" placeholder="Supplier" />
          <Input name="cost" type="number" min="0" step="0.01" placeholder="Cost (per unit)" />
          <Input name="notes" placeholder="Notes" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save part
            </Button>
          </div>
        </form>
      )}

      {parts.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No parts requested yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {parts.map((p) => (
              <PartRow key={p.id} jobId={jobId} part={p} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {parts.length} part{parts.length === 1 ? "" : "s"} · estimated cost
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(partsTotal)}</span>
          </div>
          {locked ? (
            <p className="mt-2 text-xs text-muted-foreground">
              The quotation is approved and locked, so parts can no longer be sent for approval.
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}

function PartRow({ jobId, part }: { jobId: string; part: Part }) {
  const status = PART_STATUSES.find((s) => s.value === part.status) ?? PART_STATUSES[0]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{part.part_name}</div>
        <div className="text-xs text-muted-foreground">
          Qty {part.quantity}
          {part.supplier ? ` · ${part.supplier}` : ""}
          {part.cost != null ? ` · ${formatCurrency(part.cost * part.quantity)}` : ""}
        </div>
      </div>
      <form
        action={async (fd) => {
          await updatePart(part.id, jobId, fd)
        }}
        className="flex items-center gap-2"
      >
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", status.chip)}>{status.label}</span>
        <Select
          name="status"
          defaultValue={part.status}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-8 w-32"
        >
          {PART_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </form>
      <form action={deletePart.bind(null, part.id, jobId)}>
        <button
          type="submit"
          className="text-muted-foreground hover:text-red-400"
          aria-label={`Delete ${part.part_name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
