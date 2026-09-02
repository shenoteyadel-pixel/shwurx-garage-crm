"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { Modal } from "@/components/modal"
import { receivePurchaseOrder, payPurchaseOrder } from "@/lib/actions-crm"
import { PackageCheck, CreditCard } from "lucide-react"

export function POActions({
  poId,
  status,
  balance,
  supplierInvoiceNo,
}: {
  poId: string
  status: string
  balance: number
  supplierInvoiceNo: string | null
}) {
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [recPending, startRec] = useTransition()
  const [payPending, startPay] = useTransition()

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {status !== "received" && status !== "cancelled" && (
          <Button variant="success" onClick={() => setReceiveOpen(true)}>
            <PackageCheck className="h-4 w-4" /> Receive Goods
          </Button>
        )}
        {balance > 0.01 && status !== "cancelled" && (
          <Button variant="outline" onClick={() => setPayOpen(true)}>
            <CreditCard className="h-4 w-4" /> Record Payment
          </Button>
        )}
        {status === "received" && <span className="text-sm text-emerald-400">Goods received into stock.</span>}
      </Card>

      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} size="sm" title="Receive Goods">
        <form
          action={(fd) =>
            startRec(async () => {
              await receivePurchaseOrder(poId, fd)
              setReceiveOpen(false)
            })
          }
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Marking this PO received will add all linked inventory items into stock.
          </p>
          <div>
            <Label htmlFor="supplier_invoice_no">Supplier invoice no.</Label>
            <Input id="supplier_invoice_no" name="supplier_invoice_no" defaultValue={supplierInvoiceNo ?? ""} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={recPending}>
              {recPending ? "Receiving…" : "Confirm Received"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="sm" title="Record Supplier Payment">
        <form
          action={(fd) =>
            startPay(async () => {
              await payPurchaseOrder(poId, fd)
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
            <Select id="method" name="method" defaultValue="bank">
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
