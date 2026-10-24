"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, Button, Input, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Search, FileText, AlertTriangle } from "lucide-react"

type Invoice = {
  id: string
  invoice_number: string
  customer_name: string | null
  plate: string | null
  status: string
  issue_date: string
  total: number
  amount_paid: number
}

const STATUS: Record<string, string> = {
  draft: "border-neutral-500/30 bg-neutral-500/15 text-neutral-300",
  unpaid: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  partial: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-300",
}

export type PaidJobWithoutInvoice = {
  id: string
  job_number: string | null
  customer_name: string | null
  plate_code: string | null
  plate_number: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  paid_at: string
  paid_amount: number | null
  payment_method: string | null
}

export function InvoicesClient({
  invoices,
  paidWithoutInvoice = [],
}: {
  invoices: Invoice[]
  paidWithoutInvoice?: PaidJobWithoutInvoice[]
}) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return invoices.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false
      if (!s) return true
      return [i.invoice_number, i.customer_name, i.plate].filter(Boolean).some((v) => v!.toLowerCase().includes(s))
    })
  }, [q, filter, invoices])

  const outstanding = invoices
    .filter((i) => i.status !== "cancelled" && i.status !== "paid")
    .reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0)
  const collected = invoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(collected)} collected · {formatCurrency(outstanding)} outstanding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, customer, plate…" className="w-64 pl-9" />
          </div>
          <Link href="/invoices/new">
            <Button>
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {paidWithoutInvoice.length > 0 && (
        <Card className="mb-6 overflow-hidden border-amber-500/40">
          <div className="flex flex-col gap-1 border-b border-border p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Paid jobs without an invoice ({paidWithoutInvoice.length})
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Payment was recorded on these jobs but no customer (VAT) invoice was issued. Review each one and create the
              invoice, then record the payment already received against it.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Paid on</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paidWithoutInvoice.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${j.id}`} className="font-mono font-medium text-primary hover:underline">
                        {j.job_number || "Job"}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{j.customer_name || "—"}</div>
                      {(j.plate_code || j.plate_number) && (
                        <div className="text-xs text-muted-foreground">
                          {[j.plate_code, j.plate_number].filter(Boolean).join(" ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(j.paid_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {j.paid_amount != null ? formatCurrency(j.paid_amount) : "Not entered"}
                      {j.payment_method && <div className="text-xs text-muted-foreground">{j.payment_method}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/invoices/new?job=${j.id}`}>
                        <Button variant="outline" className="h-8 text-xs">
                          <Plus className="h-3.5 w-3.5" /> Create invoice
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "unpaid", "partial", "paid", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No invoices found.</p>
          <Link href="/invoices/new">
            <Button variant="outline" className="mt-2">
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const bal = (Number(i.total) || 0) - (Number(i.amount_paid) || 0)
                  return (
                    <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${i.id}`} className="font-mono font-medium text-primary hover:underline">
                          {i.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>{i.customer_name || "—"}</div>
                        {i.plate && <div className="text-xs text-muted-foreground">{i.plate}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(i.issue_date)}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS[i.status] ?? STATUS.unpaid}>{i.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(i.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={bal > 0.01 && i.status !== "cancelled" ? "text-amber-400" : "text-emerald-400"}>
                          {formatCurrency(i.status === "cancelled" ? 0 : bal)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
