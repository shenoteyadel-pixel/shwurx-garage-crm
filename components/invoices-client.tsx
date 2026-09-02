"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, Button, Input, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Search, FileText } from "lucide-react"

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

export function InvoicesClient({ invoices }: { invoices: Invoice[] }) {
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
