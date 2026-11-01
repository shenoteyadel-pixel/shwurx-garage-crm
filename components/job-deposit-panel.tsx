"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { Modal } from "@/components/modal"
import { recordJobDeposit } from "@/lib/actions-crm"
import { formatCurrency, formatDate } from "@/lib/utils"
import { PiggyBank, Plus } from "lucide-react"

export type JobDeposit = {
  id: string
  amount: number | null
  method: string | null
  reference: string | null
  paid_at: string | null
  created_at: string | null
  invoice_id: string | null
}

export function JobDepositPanel({
  jobId,
  deposits,
  quoteTotal,
  canTake,
  hasInvoice,
}: {
  jobId: string
  deposits: JobDeposit[]
  quoteTotal: number
  canTake: boolean
  hasInvoice: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const total = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const remaining = Math.max(0, quoteTotal - total)

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PiggyBank className="h-4 w-4" /> Deposit
        </h2>
        {canTake && !hasInvoice && (
          <Button type="button" onClick={() => { setError(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> Add Deposit
          </Button>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Quotation" value={formatCurrency(quoteTotal)} />
        <Stat label="Deposit paid" value={formatCurrency(total)} tone="text-emerald-500" />
        <Stat label="Remaining" value={formatCurrency(remaining)} tone={remaining > 0.01 ? "text-amber-500" : undefined} />
      </dl>

      {deposits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deposit taken yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {deposits.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="tabular-nums text-muted-foreground">{formatDate(d.paid_at || d.created_at || "")}</span>
              <span className="capitalize">{d.method || "—"}</span>
              {d.reference && <span className="truncate text-xs text-muted-foreground">{d.reference}</span>}
              {d.invoice_id && <span className="text-xs text-muted-foreground">Applied to invoice</span>}
              <span className="ml-auto font-medium tabular-nums text-emerald-500">{formatCurrency(Number(d.amount) || 0)}</span>
            </li>
          ))}
        </ul>
      )}
      {hasInvoice && canTake && (
        <p className="mt-3 text-xs text-muted-foreground">
          This job is invoiced. Deposits were moved to the invoice; record further payments on the invoice.
        </p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Add Deposit">
        <form
          action={(fd) =>
            start(async () => {
              const res = await recordJobDeposit(jobId, fd)
              if (res.ok) setOpen(false)
              else setError(res.error)
            })
          }
          className="space-y-4"
        >
          <div>
            <Label htmlFor="deposit-amount">Amount (AED)</Label>
            <Input id="deposit-amount" name="amount" type="number" step="0.01" min="0.01" required autoFocus />
          </div>
          <div>
            <Label htmlFor="deposit-method">Method</Label>
            <Select id="deposit-method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="deposit-reference">Reference</Label>
            <Input id="deposit-reference" name="reference" />
          </div>
          <div>
            <Label htmlFor="deposit-note">Note</Label>
            <Textarea id="deposit-note" name="note" className="min-h-14" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Deposit"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${tone ?? ""}`}>{value}</dd>
    </div>
  )
}
