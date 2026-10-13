import { notFound } from "next/navigation"
import { CheckCircle2, ExternalLink, MessageCircle, Phone, ShieldCheck, Store } from "lucide-react"
import { BankDetails } from "./bank-details"
import { formatCurrency } from "@/lib/utils"
import { getPublicInvoice, confirmInvoiceCheckout } from "@/lib/actions-invoice-pay"
import { InvoiceCheckout } from "./invoice-checkout"
import { BrandLogo } from "@/components/brand-logo"

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
          <BrandLogo className="h-10" />
          <div className="leading-tight">
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
          <div className="flex flex-col gap-5">
            {inv.pay.link && (
              <a
                href={inv.pay.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {inv.pay.link.label}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}

            {inv.pay.bank && <BankDetails bank={inv.pay.bank} reference={inv.invoice_number} />}

            {inv.pay.cardEnabled && (
              <section aria-label="Card payment">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Pay securely by card
                </div>
                <InvoiceCheckout token={token} />
              </section>
            )}

            <section aria-label="Other ways to pay" className="rounded-xl border border-border bg-card p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <Store className="h-4 w-4 text-primary" aria-hidden="true" />
                Pay at the garage
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You can pay by cash or card when you collect your car
                {inv.pay.contact ? ", or contact us for any other payment method." : "."}
              </p>
              {inv.pay.contact && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <a
                    href={`https://wa.me/${inv.pay.contact.whatsapp}?text=${encodeURIComponent(
                      `Hello, I would like to pay invoice ${inv.invoice_number}.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    WhatsApp us
                  </a>
                  <a
                    href={`tel:${inv.pay.contact.phone.replace(/\s/g, "")}`}
                    className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Call {inv.pay.contact.phone}
                  </a>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-xl px-4 py-8 text-center text-xs text-muted-foreground">
        SHWURX Auto Service Center
        {inv.pay.cardEnabled ? " · Card payments are processed securely by Stripe." : ""}
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
