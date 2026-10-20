"use client"

import * as React from "react"
import { addPart, updatePart, deletePart, sendPartsToQuotation, returnPart, undoReturnPart } from "@/lib/actions"
import { sendPartsAsAdditionalWork } from "@/lib/actions-approvals"
import { Button, Card, Input, Select } from "@/components/ui"
import { PART_STATUSES } from "@/lib/constants"
import { formatCurrency, cn } from "@/lib/utils"
import { Plus, Trash2, Package, FileUp, Loader2, Undo2 } from "lucide-react"

type Part = {
  id: string
  part_name: string
  quantity: number
  status: string
  supplier: string | null
  cost: number | null
  notes: string | null
  lead_time_days?: number | null
  bucket?: "waiting" | "bought_on_quote" | "bought_extra"
  source?: "bill" | "quote" | "request"
  returned_at?: string | null
  return_to?: "supplier" | "stock" | null
  return_reason?: string | null
  return_quantity?: number | null
}

const SECTIONS = [
  { key: "waiting", title: "Still needed", hint: "Requested or quoted by a supplier, not bought yet" },
  { key: "bought_on_quote", title: "Bought for the quotation", hint: "Bought parts that match a line the customer approved" },
  { key: "bought_extra", title: "Bought, not on the quotation", hint: "On a supplier bill but not quoted to the customer" },
] as const

const LEAD_TIME_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1)

function LeadTimeOptions() {
  return (
    <>
      <option value="0">In stock</option>
      {LEAD_TIME_OPTIONS.map((d) => (
        <option key={d} value={d}>
          {d === 1 ? "1 day" : `${d} days`}
        </option>
      ))}
    </>
  )
}

const SOURCE_LABEL: Record<NonNullable<Part["source"]>, string> = {
  bill: "Supplier bill",
  quote: "Supplier quote",
  request: "Request",
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

  const activeParts = parts.filter((p) => !p.returned_at)
  const returnedParts = parts.filter((p) => p.returned_at)
  const partsTotal = activeParts.reduce((sum, p) => sum + (p.cost != null ? p.cost * p.quantity : 0), 0)

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

  async function handleSendAdditional() {
    setSending(true)
    setFeedback(null)
    try {
      const res = await sendPartsAsAdditionalWork(jobId)
      if (!res.ok) {
        const text =
          res.error === "nothing_new"
            ? "These parts are already on the approved quotation. Add the new parts first, then send them as additional work."
            : res.error === "no_items"
              ? "Add a part first."
              : "Could not create the additional-work request."
        setFeedback({ tone: "error", text })
      } else {
        setFeedback({
          tone: "ok",
          text: res.emailed
            ? "New parts sent to the customer as an additional-work request. Once approved they're added to this job's invoice."
            : "Additional-work request created. Share the approval link from Customer Approvals above.",
        })
      }
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Could not create the request." })
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
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Delivery time (if it needs ordering)
            <Select name="lead_time_days" defaultValue="0">
              <LeadTimeOptions />
            </Select>
          </label>
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
          <div className="flex flex-col gap-5">
            {SECTIONS.map((section) => {
              const rows = activeParts.filter((p) => (p.bucket ?? "waiting") === section.key)
              if (!rows.length) return null
              return (
                <section key={section.key} aria-label={section.title} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {section.title} <span className="font-normal text-muted-foreground">({rows.length})</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">{section.hint}</p>
                  </div>
                  {rows.map((p) => (
                    <PartRow key={p.id} jobId={jobId} part={p} />
                  ))}
                </section>
              )
            })}
            {returnedParts.length > 0 && (
              <section aria-label="Returned parts" className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Returned <span className="font-normal text-muted-foreground">({returnedParts.length})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">Sent back to the supplier or put back in stock</p>
                </div>
                {returnedParts.map((p) => (
                  <ReturnedPartRow key={p.id} jobId={jobId} part={p} />
                ))}
              </section>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {activeParts.length} part{activeParts.length === 1 ? "" : "s"} · estimated cost
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(partsTotal)}</span>
          </div>
          {locked ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                The quotation is approved and locked. To add parts the customer now wants, send them as additional work
                for a separate approval &mdash; once approved they&apos;re added to this job&apos;s invoice.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSendAdditional}
                disabled={sending}
                className="self-start"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                Send new parts as additional work
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

function ReturnedPartRow({ jobId, part }: { jobId: string; part: Part }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const where = part.return_to === "stock" ? "Back to stock" : "Returned to supplier"
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-background/20 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-muted-foreground line-through decoration-muted-foreground/60">
          {part.part_name}
        </div>
        <div className="text-xs text-muted-foreground">
          {where} · Qty {part.return_quantity ?? part.quantity}
          {part.returned_at ? ` · ${new Date(part.returned_at).toLocaleDateString()}` : ""}
          {part.return_reason ? ` · ${part.return_reason}` : ""}
        </div>
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      </div>
      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
        Returned
      </span>
      {part.return_to === "supplier" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const res = await undoReturnPart(part.id, jobId)
            if (!res.ok) setError(res.error)
            setBusy(false)
          }}
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      )}
    </div>
  )
}

function ReturnForm({ jobId, part, onDone }: { jobId: string; part: Part; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <form
      action={async (fd) => {
        setBusy(true)
        setError(null)
        const res = await returnPart(part.id, jobId, fd)
        setBusy(false)
        if (!res.ok) setError(res.error)
        else onDone()
      }}
      className="grid w-full gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-3"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Return to
        <Select name="return_to" defaultValue="supplier" required>
          <option value="supplier">Supplier</option>
          <option value="stock">Garage stock</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Quantity
        <Input
          name="return_quantity"
          type="number"
          min="1"
          max={part.quantity}
          step="1"
          defaultValue={String(part.quantity)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Reason
        <Input name="return_reason" placeholder="Wrong part, damaged, not needed..." maxLength={500} />
      </label>
      {error && <p className="text-xs text-red-300 sm:col-span-3">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Confirm return
        </Button>
      </div>
    </form>
  )
}

function PartRow({ jobId, part }: { jobId: string; part: Part }) {
  const status = PART_STATUSES.find((s) => s.value === part.status) ?? PART_STATUSES[0]
  const [returning, setReturning] = React.useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{part.part_name}</div>
        <div className="text-xs text-muted-foreground">
          {part.source ? `${SOURCE_LABEL[part.source]} · ` : ""}
          Qty {part.quantity}
          {part.supplier ? ` · ${part.supplier}` : ""}
          {part.notes ? ` · ${part.notes}` : ""}
          {part.cost != null ? ` · ${formatCurrency(part.cost * part.quantity)}` : ""}
        </div>
      </div>
      <form
        action={async (fd) => {
          await updatePart(part.id, jobId, fd)
        }}
        className="flex items-center gap-2"
      >
        <Select
          name="lead_time_days"
          aria-label={`Delivery time for ${part.part_name}`}
          defaultValue={String(part.lead_time_days ?? 0)}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-8 w-28"
        >
          <LeadTimeOptions />
        </Select>
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
      <button
        type="button"
        onClick={() => setReturning((r) => !r)}
        className="text-muted-foreground hover:text-amber-300"
        aria-label={`Return ${part.part_name}`}
        aria-expanded={returning}
        title="Return part"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <form action={deletePart.bind(null, part.id, jobId)}>
        <button
          type="submit"
          className="text-muted-foreground hover:text-red-400"
          aria-label={`Delete ${part.part_name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </form>
      {returning && <ReturnForm jobId={jobId} part={part} onDone={() => setReturning(false)} />}
    </div>
  )
}
