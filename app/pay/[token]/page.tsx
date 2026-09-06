import { notFound } from "next/navigation"
import { Wrench, CheckCircle2, ShieldCheck } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getPublicInvoice, confirmInvoiceCheckout } from "@/lib/actions-invoice-pay"
import { InvoiceCheckout } from "./invoice-checkout"

export const dynamic = "force-dynamic"

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { token } = await params
  const { session_id } = await searchParams

  // If the customer just returned from Stripe, verify + record the payment
  // before we render, so the page reflects the paid state immediately.
  if (session_id) {
    try {
      await confirmInvoiceCheckout(token, session_id)
    } catch {
      /* fall through — page will still render current invoice state */
    }
  }

  const inv = await getPublicInvoice(token)
  if (!inv) notFound()

  const isPaid = inv.status === "paid" || inv.balance <= 0.01
  const isCancelled = inv.status === "cancelled"
  const justPaid = !!session_id && isPaid

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-xl items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">
              SHWURX <span className="text-primary">Auto Service Center</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice &amp; Payment</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        <div className="mb-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-lg font-bold tracking-tight">{inv.invoice_number}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {inv.customer_name}
                {inv.vehicle_desc ? ` · ${inv.vehicle_desc}` : ""}
                {inv.plate ? ` · ${inv.plate}` : ""}
              </p>
            </div>
            <StatusBadge status={isCancelled ? "cancelled" : isPaid ? "paid" : inv.status} />
          </div>

          <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <Row label="Invoice total" value={formatCurrency(inv.total)} />
            {inv.amount_paid > 0 && <Row label="Already paid" value={formatCurrency(inv.amount_paid)} />}
            <div className="flex items-center justify-between pt-1 text-base font-bold">
              <span>{isPaid ? "Paid in full" : "Amount due"}</span>
              <span className={`tabular-nums ${isPaid ? "text-emerald-400" : "text-primary"}`}>
                {formatCurrency(isPaid ? inv.total : inv.balance)}
              </span>
            </div>
          </div>
        </div>

        {justPaid && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>Thank you! Your payment was received and your invoice is now marked paid.</span>
          </div>
        )}

        {isCancelled ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            This invoice has been cancelled. Please contact us if you have any questions.
          </p>
        ) : isPaid ? (
          !justPaid && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              <span>This invoice has been paid in full. No further action is needed.</span>
            </div>
          )
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Pay securely by card
            </div>
            <InvoiceCheckout token={token} />
          </>
        )}
      </main>

      <footer className="mx-auto max-w-xl px-4 py-8 text-center text-xs text-muted-foreground">
        Secured by SHWURX Auto Service Center · Payments are processed securely by Stripe.
      </footer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    unpaid: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    partial: "border-sky-500/30 bg-sky-500/15 text-sky-300",
    paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    cancelled: "border-red-500/30 bg-red-500/15 text-red-300",
  }
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${map[status] ?? map.unpaid}`}
    >
      {status}
    </span>
  )
}
