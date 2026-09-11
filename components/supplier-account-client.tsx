"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, Button, Input, Label, Badge } from "@/components/ui"
import { Modal } from "@/components/modal"
import { recordSupplierInvoicePayment } from "@/lib/actions-invoices"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Wallet, FileText, Plus } from "lucide-react"

export type AccountInvoice = {
  id: string
  doc_number: string | null
  invoice_number: string | null
  invoice_date: string | null
  status: string
  payment_status: string
  total: number
  amount_paid: number
}

export type AccountPayment = {
  id: string
  amount: number
  method: string | null
  reference: string | null
  paid_at: string | null
  created_at: string | null
  invoice_label: string | null
}

const PAYMENT_BADGE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  unpaid: "border-red-500/30 bg-red-500/10 text-red-400",
  credit: "border-sky-500/30 bg-sky-500/10 text-sky-400",
}

export function SupplierAccountClient({
  invoices,
  payments,
  canRecord,
}: {
  invoices: AccountInvoice[]
  payments: AccountPayment[]
  canRecord: boolean
}) {
  const [payFor, setPayFor] = useState<AccountInvoice | null>(null)

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Bills</h2>
            <span className="ml-auto text-xs text-muted-foreground">{invoices.length} invoices</span>
          </div>
          {invoices.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No supplier invoices captured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const balance = Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0))
                    const confirmed = inv.status === "confirmed"
                    return (
                      <tr key={inv.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Link
                            href={`/purchasing/invoices/${inv.id}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {inv.doc_number || inv.invoice_number || "view"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(inv.total)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(balance)}</td>
                        <td className="px-4 py-3">
                          {confirmed ? (
                            <Badge className={PAYMENT_BADGE[inv.payment_status] ?? PAYMENT_BADGE.unpaid}>
                              {inv.payment_status}
                            </Badge>
                          ) : (
                            <Badge className="border-border bg-secondary text-secondary-foreground">draft</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRecord && confirmed && balance > 0.01 && (
                            <button
                              onClick={() => setPayFor(inv)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                            >
                              <Plus className="h-3 w-3" /> Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Payments</h2>
            <span className="ml-auto text-xs text-muted-foreground">{payments.length}</span>
          </div>
          {payments.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums">{formatCurrency(p.amount)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(p.paid_at ?? p.created_at)}
                      {p.method ? ` · ${p.method}` : ""}
                      {p.invoice_label ? ` · ${p.invoice_label}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Record payment">
        {payFor && <PaymentForm invoice={payFor} onDone={() => setPayFor(null)} />}
      </Modal>
    </>
  )
}

function PaymentForm({ invoice, onDone }: { invoice: AccountInvoice; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const balance = Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amount_paid) || 0))

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null)
          try {
            await recordSupplierInvoicePayment(invoice.id, fd)
            onDone()
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not record payment")
          }
        })
      }
      className="space-y-4"
    >
      <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Invoice</span>
          <span className="font-mono">{invoice.doc_number || invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Outstanding</span>
          <span className="font-medium tabular-nums">{formatCurrency(balance)}</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="amount">Amount (AED)</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0" defaultValue={balance.toFixed(2)} required />
        </div>
        <div>
          <Label htmlFor="method">Method</Label>
          <select
            id="method"
            name="method"
            defaultValue="bank"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="bank">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
        <div>
          <Label htmlFor="paid_at">Date</Label>
          <Input id="paid_at" name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div>
          <Label htmlFor="reference">Reference</Label>
          <Input id="reference" name="reference" placeholder="Txn / cheque no." />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  )
}
