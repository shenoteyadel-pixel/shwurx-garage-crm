"use client"

import { useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { Modal } from "@/components/modal"
import { recordInvoicePayment, cancelInvoice, setInvoicePaymentLink } from "@/lib/actions-crm"
import { CreditCard, Ban, Link2, ExternalLink, CheckCircle2 } from "lucide-react"

export function InvoiceActions({
  invoiceId,
  status,
  balance,
  paymentLinkUrl,
  paymentLinkLabel,
  paymentLinkEnabled,
}: {
  invoiceId: string
  status: string
  balance: number
  paymentLinkUrl?: string | null
  paymentLinkLabel?: string | null
  paymentLinkEnabled?: boolean
}) {
  const [payOpen, setPayOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [payPending, startPay] = useTransition()
  const [linkPending, startLink] = useTransition()
  const [cancelPending, startCancel] = useTransition()

  if (status === "cancelled") {
    return (
      <Card className="p-4 text-sm text-muted-foreground">This invoice has been cancelled.</Card>
    )
  }

  const linkLive = paymentLinkEnabled && !!paymentLinkUrl

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {balance > 0.01 && (
          <Button onClick={() => setPayOpen(true)}>
            <CreditCard className="h-4 w-4" /> Record Payment
          </Button>
        )}
        {balance > 0.01 && (
          <Button variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4" /> {paymentLinkUrl ? "Edit Payment Link" : "Add Payment Link"}
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

      {paymentLinkUrl && balance > 0.01 && (
        <Card className="mt-3 flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            {linkLive ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Link2 className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={linkLive ? "text-emerald-400" : "text-muted-foreground"}>
              {linkLive ? "PAY NOW link is live for the customer" : "Payment link saved (hidden from customer)"}
            </span>
          </div>
          <a
            href={paymentLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-sky-400 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open link
          </a>
        </Card>
      )}

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} size="sm" title="Customer Payment Link">
        <form
          action={(fd) =>
            startLink(async () => {
              await setInvoicePaymentLink(invoiceId, fd)
              setLinkOpen(false)
            })
          }
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Paste a payment URL from your bank, Stripe, PayTabs, or any provider. When enabled, the customer sees a
            <span className="font-medium text-foreground"> PAY NOW</span> button on their tracking page and invoice.
          </p>
          <div>
            <Label htmlFor="payment_link_url">Payment URL</Label>
            <Input
              id="payment_link_url"
              name="payment_link_url"
              type="url"
              inputMode="url"
              placeholder="https://pay.example.com/inv/..."
              defaultValue={paymentLinkUrl ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="payment_link_label">Button label (optional)</Label>
            <Input id="payment_link_label" name="payment_link_label" placeholder="Pay Now" defaultValue={paymentLinkLabel ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="payment_link_enabled"
              defaultChecked={paymentLinkEnabled ?? false}
              className="h-4 w-4 rounded border-border"
            />
            Show this link to the customer
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={linkPending}>
              {linkPending ? "Saving…" : "Save Link"}
            </Button>
          </div>
        </form>
      </Modal>

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
