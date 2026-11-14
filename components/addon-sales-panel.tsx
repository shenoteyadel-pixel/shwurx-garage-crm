"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui"
import { cn } from "@/lib/utils"
import { COMMISSION_STATUS_LABEL, computeLine } from "@/lib/addon-commission"
import type { LedgerRow, PanelCatalogItem } from "@/lib/addon-sales-data"
import {
  addAddonToJob,
  cancelAddonSale,
  markAddonCompleted,
  overrideCommissionRate,
  removeDraftAddon,
  sendAddonsForApproval,
  updateAddonLine,
} from "@/lib/actions-addon-sales"

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const REC_TONE: Record<string, string> = {
  flagged: "border-destructive/40 bg-destructive/10 text-destructive",
  due: "border-primary/40 bg-primary/10 text-primary",
  ok: "border-border text-muted-foreground",
  recent: "border-border bg-muted text-muted-foreground",
  incompatible: "border-border bg-muted text-muted-foreground line-through",
}
const REC_LABEL: Record<string, string> = { flagged: "Flagged", due: "Due", ok: "Available", recent: "Recently done", incompatible: "Not compatible" }

const STATUS_TONE: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  proposed: "border-primary/40 text-primary",
  approved: "border-primary/40 bg-primary/10 text-primary",
  completed: "border-primary bg-primary text-primary-foreground",
  rejected: "border-destructive/40 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
}

export function AddonSalesPanel({
  jobId,
  catalog,
  lines,
  canEdit,
  canSeeCost,
  canComplete,
  isAdmin,
}: {
  jobId: string
  catalog: PanelCatalogItem[]
  lines: LedgerRow[]
  canEdit: boolean
  canSeeCost: boolean
  canComplete: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState("")

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      setError(null)
      setNotice(null)
      const res = await fn()
      if (!res.ok) setError(res.error ?? "Something went wrong.")
      else {
        if (success) setNotice(success)
        router.refresh()
      }
    })

  const onJob = new Set(lines.filter((l) => !["rejected", "cancelled"].includes(l.status)).map((l) => l.catalog_id))
  const drafts = lines.filter((l) => l.status === "draft")
  const live = lines.filter((l) => l.status !== "draft")
  const approvedRevenue = live.filter((l) => ["approved", "completed"].includes(l.status)).reduce((s, l) => s + l.line.netAmount, 0)
  const commission = live.reduce((s, l) => s + l.commission.potential, 0)

  return (
    <div className="flex flex-col gap-4">
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={cn("rounded-lg border px-3 py-2 text-sm", error ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary")}
        >
          {error ?? notice}
        </p>
      )}

      <div className="flex flex-wrap gap-6 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Approved add-on revenue</span>
          <span className="font-semibold tabular-nums">{aed(approvedRevenue)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Advisor commission (potential)</span>
          <span className="font-semibold tabular-nums">{aed(commission)}</span>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Commission is earned only after the customer approves, the work is completed and the invoice is paid. Prices exclude VAT.
        </p>
      </div>

      {canEdit && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Recommend an add-on</h3>
            <span className="text-xs text-muted-foreground">Sorted by what this vehicle needs most</span>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {catalog.map((c) => {
              const added = onJob.has(c.id)
              const blocked = c.recommendation.level === "incompatible"
              return (
                <li key={c.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge className={REC_TONE[c.recommendation.level]}>{REC_LABEL[c.recommendation.level]}</Badge>
                      {c.stock !== null && (
                        <span className={cn("text-xs", c.stock > 0 ? "text-muted-foreground" : "text-destructive")}>
                          {c.stock > 0 ? `${c.stock} in stock` : "Out of stock"}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {c.category} · {c.recommendation.reason}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex flex-col items-end text-xs">
                      <span className="font-semibold tabular-nums text-foreground">{aed(c.selling_price)}</span>
                      <span className="text-muted-foreground">
                        {c.commission_eligible ? `≈ ${aed(c.est_commission)} commission` : "No commission"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={added ? "ghost" : "primary"}
                      disabled={pending || added || blocked}
                      onClick={() => {
                        if (c.recommendation.level === "recent") {
                          setNoteFor(c.id)
                          setNote("")
                        } else run(() => addAddonToJob(jobId, c.id))
                      }}
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </div>
                  {noteFor === c.id && (
                    <form
                      className="flex w-full flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault()
                        run(() => addAddonToJob(jobId, c.id, note))
                        setNoteFor(null)
                      }}
                    >
                      <label htmlFor={`why-${c.id}`} className="sr-only">
                        Why is it needed again?
                      </label>
                      <Input
                        id={`why-${c.id}`}
                        required
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Why is it needed again? e.g. contaminated fluid found"
                      />
                      <Button size="sm" type="submit" disabled={pending}>
                        Add anyway
                      </Button>
                    </form>
                  )}
                </li>
              )
            })}
            {!catalog.length && <li className="py-2 text-sm text-muted-foreground">No active add-ons. An admin can add them in Settings.</li>}
          </ul>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Draft — not yet sent to the customer</h3>
            {canEdit && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null)
                    const res = await sendAddonsForApproval(jobId)
                    if (!res.ok) setError(res.error)
                    else {
                      setNotice(res.emailed ? "Sent for approval and emailed to the customer." : "Approval link created. Share it from the Approvals panel.")
                      router.refresh()
                    }
                  })
                }
              >
                Send {drafts.length} for customer approval
              </Button>
            )}
          </div>
          {drafts.map((l) => (
            <DraftLine key={l.id} line={l} canEdit={canEdit} canSeeCost={canSeeCost} pending={pending} run={run} />
          ))}
        </Card>
      )}

      {live.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Add-on sales on this job</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Add-on</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Net</th>
                {canSeeCost && <th className="px-4 py-2 text-right font-medium">Profit</th>}
                <th className="px-4 py-2 text-right font-medium">Commission</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {live.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {l.name}
                      {Number(l.quantity) !== 1 && <span className="text-muted-foreground"> × {l.quantity}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{l.advisor_name ?? "—"}</div>
                    {l.cancel_reason && <div className="text-xs text-muted-foreground">Cancelled: {l.cancel_reason}</div>}
                    {l.rate_override_reason && (
                      <div className="text-xs text-muted-foreground">
                        Rate {l.commission_pct}%: {l.rate_override_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Badge className={STATUS_TONE[l.status]}>{l.status[0].toUpperCase() + l.status.slice(1)}</Badge>
                      <span className="text-xs text-muted-foreground">{COMMISSION_STATUS_LABEL[l.commission.status]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{aed(l.line.netAmount)}</td>
                  {canSeeCost && (
                    <td className={cn("px-4 py-3 text-right tabular-nums", l.line.grossProfit < 0 && "text-destructive")}>
                      {aed(l.line.grossProfit)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div>{aed(l.commission.potential)}</div>
                    {l.commission.earned > 0 && l.commission.earned < l.commission.potential && (
                      <div className="text-xs text-muted-foreground">{aed(l.commission.earned)} earned</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LiveActions line={l} canEdit={canEdit} canComplete={canComplete} isAdmin={isAdmin} pending={pending} run={run} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void

function DraftLine({ line, canEdit, canSeeCost, pending, run }: { line: LedgerRow; canEdit: boolean; canSeeCost: boolean; pending: boolean; run: Runner }) {
  const [qty, setQty] = useState(String(line.quantity))
  const [discount, setDiscount] = useState(String(line.discount))
  const [rec, setRec] = useState(line.recommendation)
  const [notes, setNotes] = useState(line.notes ?? "")
  const [evidence, setEvidence] = useState(line.evidence_url ?? "")
  const preview = computeLine({
    quantity: Number(qty) || 0,
    unitPrice: Number(line.unit_price),
    unitCost: Number(line.unit_cost),
    unitExtraCost: Number(line.unit_extra_cost),
    discount: Number(discount) || 0,
    commissionPct: Number(line.commission_pct),
    commissionEligible: line.commission_eligible,
  })
  const id = (k: string) => `${line.id}-${k}`

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => updateAddonLine(line.id, { quantity: Number(qty), discount: Number(discount), recommendation: rec, notes, evidence_url: evidence }), "Line saved.")
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{line.name}</span>
        <span className="text-xs text-muted-foreground">
          {aed(Number(line.unit_price))} each · fixed by admin
        </span>
      </div>
      <fieldset disabled={!canEdit || pending} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label htmlFor={id("qty")} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Quantity
          <Input id={id("qty")} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label htmlFor={id("disc")} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Discount (AED)
          <Input id={id("disc")} type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <label htmlFor={id("rec")} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Priority
          <Select id={id("rec")} value={rec} onChange={(e) => setRec(e.target.value)}>
            <option value="required">Required</option>
            <option value="recommended">Recommended</option>
            <option value="optional">Optional</option>
          </Select>
        </label>
        <label htmlFor={id("ev")} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Evidence link (photo)
          <Input id={id("ev")} type="url" placeholder="https://" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </label>
        <label htmlFor={id("notes")} className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-4">
          Note for the customer
          <Textarea id={id("notes")} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this is recommended" />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Net <span className="font-semibold tabular-nums text-foreground">{aed(preview.netAmount)}</span>
          {canSeeCost && (
            <>
              {" · "}Profit{" "}
              <span className={cn("font-semibold tabular-nums", preview.grossProfit < 0 ? "text-destructive" : "text-foreground")}>
                {aed(preview.grossProfit)}
              </span>
            </>
          )}
          {" · "}Commission <span className="font-semibold tabular-nums text-foreground">{aed(preview.commission)}</span>
        </span>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" type="button" disabled={pending} onClick={() => run(() => removeDraftAddon(line.id))}>
              Remove
            </Button>
            <Button size="sm" type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        )}
      </div>
    </form>
  )
}

function LiveActions({
  line,
  canEdit,
  canComplete,
  isAdmin,
  pending,
  run,
}: {
  line: LedgerRow
  canEdit: boolean
  canComplete: boolean
  isAdmin: boolean
  pending: boolean
  run: Runner
}) {
  const [mode, setMode] = useState<null | "cancel" | "rate">(null)
  const [reason, setReason] = useState("")
  const [rate, setRate] = useState(String(line.commission_pct))
  const open = !["rejected", "cancelled"].includes(line.status)
  const canCancel = open && (line.status === "proposed" ? canEdit : isAdmin)

  if (mode) {
    return (
      <form
        className="flex min-w-48 flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => (mode === "cancel" ? cancelAddonSale(line.id, reason) : overrideCommissionRate(line.id, Number(rate), reason)))
          setMode(null)
        }}
      >
        {mode === "rate" && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            New rate (%)
            <Input type="number" min="0" max="100" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reason
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={pending}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setMode(null)}>
            Back
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {line.status === "approved" && canComplete && (
        <Button size="sm" disabled={pending} onClick={() => run(() => markAddonCompleted(line.id), "Marked completed.")}>
          Mark done
        </Button>
      )}
      {isAdmin && open && !line.payout && (
        <Button size="sm" variant="ghost" onClick={() => setMode("rate")}>
          Rate
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
          Cancel
        </Button>
      )}
    </div>
  )
}
