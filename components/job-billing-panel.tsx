import Link from "next/link"
import { Badge, Card } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ReceiptText, Wallet } from "lucide-react"

export type JobInvoice = {
  id: string
  invoice_number: string
  status: string
  issue_date: string | null
  total: number | null
  amount_paid: number | null
}

export type JobPayment = {
  id: string
  invoice_id: string | null
  amount: number | null
  method: string | null
  reference: string | null
  paid_at: string | null
  created_at: string | null
}

const STATUS: Record<string, string> = {
  draft: "border-neutral-500/30 bg-neutral-500/15 text-muted-foreground",
  unpaid: "border-amber-500/30 bg-amber-500/15 text-amber-500",
  partial: "border-sky-500/30 bg-sky-500/15 text-sky-500",
  paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-500",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-500",
}

export function JobBillingPanel({
  jobId,
  invoices,
  payments,
}: {
  jobId: string
  invoices: JobInvoice[]
  payments: JobPayment[]
}) {
  const live = invoices.filter((i) => i.status !== "cancelled")
  const billed = live.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const paid = live.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0)
  const balance = Math.max(0, billed - paid)
  const invoiceNo = new Map(invoices.map((i) => [i.id, i.invoice_number]))

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ReceiptText className="h-4 w-4" /> Invoices
          </h2>
          <Link
            href={`/invoices/new?job=${jobId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <ReceiptText className="h-4 w-4" /> Create Invoice
          </Link>
        </div>

        <dl className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Invoiced" value={formatCurrency(billed)} />
          <Stat label="Paid" value={formatCurrency(paid)} tone="text-emerald-500" />
          <Stat label="Balance" value={formatCurrency(balance)} tone={balance > 0.01 ? "text-amber-500" : undefined} />
        </dl>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoice for this job yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {invoices.map((i) => {
              const bal = i.status === "cancelled" ? 0 : (Number(i.total) || 0) - (Number(i.amount_paid) || 0)
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/invoices/${i.id}`} className="font-mono font-medium text-primary hover:underline">
                    {i.invoice_number}
                  </Link>
                  <Badge className={STATUS[i.status] ?? STATUS.unpaid}>{i.status}</Badge>
                  <span className="text-muted-foreground">{i.issue_date ? formatDate(i.issue_date) : "—"}</span>
                  <span className="ml-auto tabular-nums">{formatCurrency(Number(i.total) || 0)}</span>
                  <span className={`w-28 text-right tabular-nums ${bal > 0.01 ? "text-amber-500" : "text-emerald-500"}`}>
                    {bal > 0.01 ? `${formatCurrency(bal)} due` : "Settled"}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Wallet className="h-4 w-4" /> Customer payments
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment received from the customer yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="tabular-nums text-muted-foreground">{formatDate(p.paid_at || p.created_at || "")}</span>
                <span className="capitalize">{p.method || "—"}</span>
                {p.invoice_id && invoiceNo.get(p.invoice_id) && (
                  <span className="font-mono text-xs text-muted-foreground">{invoiceNo.get(p.invoice_id)}</span>
                )}
                {p.reference && <span className="truncate text-xs text-muted-foreground">{p.reference}</span>}
                <span className="ml-auto font-medium tabular-nums text-emerald-500">
                  {formatCurrency(Number(p.amount) || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
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
