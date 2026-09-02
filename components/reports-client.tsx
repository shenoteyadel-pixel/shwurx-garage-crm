"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatCurrency as money } from "@/lib/utils"
import { Card, PrimaryButton, GhostButton } from "@/components/ui"

type Summary = {
  salesSubtotal: number
  salesVat: number
  salesTotal: number
  collected: number
  outstanding: number
  partsSales: number
  labourSales: number
  purchaseSubtotal: number
  purchaseVat: number
  purchaseTotal: number
  payable: number
  stockValue: number
  netVat: number
  grossProfit: number
  invoiceCount: number
  poCount: number
}

type InvoiceRow = {
  invoice_number: string
  customer_name: string
  status: string
  issue_date: string
  subtotal: number
  vat_amount: number
  total: number
  amount_paid: number
}
type PurchaseRow = {
  po_number: string
  order_date: string
  status: string
  subtotal: number
  vat_amount: number
  total: number
  amount_paid: number
  suppliers?: { name: string } | null
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsClient({
  from,
  to,
  summary,
  invoices,
  purchases,
}: {
  from: string
  to: string
  summary: Summary
  invoices: InvoiceRow[]
  purchases: PurchaseRow[]
}) {
  const router = useRouter()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  function apply() {
    router.push(`/reports?from=${f}&to=${t}`)
  }

  function preset(kind: "month" | "quarter" | "year") {
    const now = new Date()
    let start: Date
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    if (kind === "month") start = new Date(now.getFullYear(), now.getMonth(), 1)
    else if (kind === "quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    else start = new Date(now.getFullYear(), 0, 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    router.push(`/reports?from=${fmt(start)}&to=${fmt(kind === "year" ? new Date(now.getFullYear(), 11, 31) : end)}`)
  }

  function exportSales() {
    downloadCsv(`sales-${from}-to-${to}.csv`, [
      ["Invoice", "Customer", "Date", "Status", "Subtotal", "VAT", "Total", "Paid", "Balance"],
      ...invoices.map((i) => [
        i.invoice_number,
        i.customer_name,
        i.issue_date,
        i.status,
        Number(i.subtotal).toFixed(2),
        Number(i.vat_amount).toFixed(2),
        Number(i.total).toFixed(2),
        Number(i.amount_paid).toFixed(2),
        (Number(i.total) - Number(i.amount_paid)).toFixed(2),
      ]),
    ])
  }

  function exportPurchases() {
    downloadCsv(`purchases-${from}-to-${to}.csv`, [
      ["PO", "Supplier", "Date", "Status", "Subtotal", "VAT", "Total", "Paid", "Balance"],
      ...purchases.map((p) => [
        p.po_number,
        p.suppliers?.name ?? "",
        p.order_date,
        p.status,
        Number(p.subtotal).toFixed(2),
        Number(p.vat_amount).toFixed(2),
        Number(p.total).toFixed(2),
        Number(p.amount_paid).toFixed(2),
        (Number(p.total) - Number(p.amount_paid)).toFixed(2),
      ]),
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Financial summary for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={t}
              onChange={(e) => setT(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <PrimaryButton onClick={apply}>Apply</PrimaryButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={() => preset("month")}>This Month</GhostButton>
        <GhostButton onClick={() => preset("quarter")}>This Quarter</GhostButton>
        <GhostButton onClick={() => preset("year")}>This Year</GhostButton>
      </div>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Sales (incl. VAT)" value={money(summary.salesTotal)} sub={`${summary.invoiceCount} invoices`} />
        <Metric label="Collected" value={money(summary.collected)} tone="pos" />
        <Metric label="Outstanding (receivable)" value={money(summary.outstanding)} tone={summary.outstanding > 0 ? "warn" : "pos"} />
        <Metric label="Gross Profit (est.)" value={money(summary.grossProfit)} tone={summary.grossProfit >= 0 ? "pos" : "neg"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales / VAT */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Sales & VAT</h2>
            <GhostButton onClick={exportSales}>Export CSV</GhostButton>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Parts sales" value={money(summary.partsSales)} />
            <Row label="Labour sales" value={money(summary.labourSales)} />
            <Row label="Net sales (excl. VAT)" value={money(summary.salesSubtotal)} />
            <Row label="Output VAT (5%)" value={money(summary.salesVat)} />
            <Row label="Total invoiced" value={money(summary.salesTotal)} strong />
          </dl>
        </Card>

        {/* Purchases */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Purchases</h2>
            <GhostButton onClick={exportPurchases}>Export CSV</GhostButton>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Net purchases (excl. VAT)" value={money(summary.purchaseSubtotal)} />
            <Row label="Input VAT" value={money(summary.purchaseVat)} />
            <Row label="Total purchases" value={money(summary.purchaseTotal)} />
            <Row label="Payable to suppliers" value={money(summary.payable)} strong />
            <Row label={`Purchase orders`} value={String(summary.poCount)} />
          </dl>
        </Card>

        {/* VAT position */}
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">VAT Position (FTA)</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Output VAT (on sales)" value={money(summary.salesVat)} />
            <Row label="Input VAT (on purchases)" value={money(summary.purchaseVat)} />
            <Row
              label="Net VAT payable"
              value={money(summary.netVat)}
              strong
              tone={summary.netVat >= 0 ? "warn" : "pos"}
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Net VAT payable = output VAT collected − input VAT paid. A negative value is refundable.
          </p>
        </Card>

        {/* Stock */}
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Stock & Position</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Stock value (at cost)" value={money(summary.stockValue)} />
            <Row label="Receivable (customers)" value={money(summary.outstanding)} />
            <Row label="Payable (suppliers)" value={money(summary.payable)} />
          </dl>
        </Card>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "pos" | "neg" | "warn"
}) {
  const color =
    tone === "pos"
      ? "text-emerald-500"
      : tone === "neg"
        ? "text-red-500"
        : tone === "warn"
          ? "text-amber-500"
          : "text-foreground"
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: "pos" | "neg" | "warn"
}) {
  const color =
    tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-red-500" : tone === "warn" ? "text-amber-500" : ""
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`${strong ? "font-semibold" : ""} ${color}`}>{value}</dd>
    </div>
  )
}
