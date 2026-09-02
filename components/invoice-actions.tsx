"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { Modal } from "@/components/modal"
import { recordInvoicePayment, cancelInvoice } from "@/lib/actions-crm"
import { CreditCard, Ban } from "lucide-react"

export function InvoiceActions({
  invoiceId,
  status,
  balance,
}: {
  invoiceId: string
  status: string
  balance: number
}) {
  const [payOpen, setPayOpen] = useState(false)
  const [payPending, startPay] = useTransition()
  const [cancelPending, startCancel] = useTransition()

  if (status === "cancelled") {
    return (
      <Card className="p-4 text-sm text-muted-foreground">This invoice has been cancelled.</Card>
    )
  }

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {balance > 0.01 && (
          <Button onClick={() => setPayOpen(true)}>
            <CreditCard className="h-4 w-4" /> Record Payment
          </Button>
        )}
        {status === "paid" && <span className="text-sm text-emerald-400">Fully paid.</span>}
        <Button
          variant="ghost"
          className="ml-auto text-red-400 hover:bg-red-500/10"
          disabled={cancelPending}
          onClick={() => startCancel(async () => cancelInvoice(invoiceId))}
        >
          <Ban className="h-4 w-4" /> Cancel Invoice
        </Button>
      </Card>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="sm" title="Record Payment">
        <form
          action={(fd) =>
            startPay(async () => {
              await recordInvoicePayment(invoiceId, fd)
              setPayOpen(false)
            })
          }
          className="space-y-4"
        >
          <div>
            <Label htmlFor="amount">Amount (AED)</Label>
            <Input id="amount" name="amount" type="number" step="0.01" defaultValue={balance.toFixed(2)} required />
          </div>
          <div>
            <Label htmlFor="method">Method</Label>
            <Select id="method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" />
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" name="note" className="min-h-14" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={payPending}>
              {payPending ? "Saving…" : "Record Payment"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
