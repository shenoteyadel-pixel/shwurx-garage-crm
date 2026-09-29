"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FileDown, FileSpreadsheet, Loader2, Landmark } from "lucide-react"
import { cn, formatCurrency as money } from "@/lib/utils"
import { Card, GhostButton, PrimaryButton, Input } from "@/components/ui"
import type { FinanceReport, LedgerRow } from "@/lib/finance"
import { buildFinanceAuditPdf, downloadFinanceCsv } from "@/components/finance-audit-pdf"

type Company = { name: string; trn: string | null; address: string | null }

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const LEDGER_FILTERS = ["All", "Sale", "Purchase", "Payment in", "Payment out", "Expense"] as const

export function FinanceView({ report, company }: { report: FinanceReport; company: Company }) {
  const router = useRouter()
  const [from, setFrom] = useState(report.from)
  const [to, setTo] = useState(report.to)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof LEDGER_FILTERS)[number]>("All")

  const go = (f: string, t: string) => router.push(`/finance?from=${f}&to=${t}`)
  const now = new Date()
  const presets: { label: string; range: () => [Date, Date] }[] = [
    { label: "This month", range: () => [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)] },
    { label: "Last month", range: () => [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)] },
    {
      label: "This quarter",
      range: () => {
        const q = Math.floor(now.getMonth() / 3)
        return [new Date(now.getFullYear(), q * 3, 1), new Date(now.getFullYear(), q * 3 + 3, 0)]
      },
    },
    { label: "This year", range: () => [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)] },
    { label: "Last year", range: () => [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31)] },
  ]

  async function downloadPdf() {
    setBusy(true)
    setError(null)
    try {
      await buildFinanceAuditPdf(report, company)
    } catch (e) {
      setError((e as Error).message || "Could not create the PDF")
    } finally {
      setBusy(false)
    }
  }

  const p = report.pnl
  const ledger = filter === "All" ? report.ledger : report.ledger.filter((l) => l.type === filter)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-balance">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Profit, cash, money owed and a full audit trail for {report.from} to {report.to}.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <span className="inline-flex flex-col gap-1">
            <PrimaryButton type="button" onClick={downloadPdf} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
              {busy ? "Creating PDF…" : "Download audit report (PDF)"}
            </PrimaryButton>
            {error && (
              <span role="alert" className="text-xs text-destructive">
                {error}
              </span>
            )}
          </span>
          <GhostButton type="button" size="md" onClick={() => downloadFinanceCsv(report, company)}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Excel (CSV)
          </GhostButton>
        </div>
      </header>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((pr) => {
            const [a, b] = pr.range()
            const active = fmt(a) === report.from && fmt(b) === report.to
            return (
              <button
                key={pr.label}
                type="button"
                onClick={() => go(fmt(a), fmt(b))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {pr.label}
              </button>
            )
          })}
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (from && to && from <= to) go(from, to)
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <GhostButton type="submit" size="md">
            Apply
          </GhostButton>
        </form>
      </Card>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Net sales" value={money(p.salesNet)} hint="excl. VAT" />
        <Kpi label="Purchases" value={money(p.purchasesNet)} hint="excl. VAT" />
        <Kpi label="Net profit" value={money(p.netProfit)} hint={`${p.margin.toFixed(1)}% margin`} tone={p.netProfit >= 0 ? "good" : "bad"} />
        <Kpi label="Cash position" value={money(report.cash.net)} hint="received − paid" tone={report.cash.net >= 0 ? "good" : "bad"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">Profit & loss</h2>
          <dl className="flex flex-col text-sm">
            <Line label="Parts revenue" value={p.partsRevenue} />
            <Line label="Labour revenue" value={p.labourRevenue} />
            <Line label="Discounts given" value={-p.discount} />
            <Line label="Net sales" value={p.salesNet} strong />
            <Line label="Purchases" value={-p.purchasesNet} />
            <Line label="Gross profit" value={p.grossProfit} strong />
            <Line label="Car expenses" value={-p.expenses} />
            <Line label="Net profit" value={p.netProfit} strong highlight />
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-base font-semibold">Cash by payment method</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Method</th>
                  <th className="py-1 text-right font-medium">In</th>
                  <th className="py-1 text-right font-medium">Out</th>
                </tr>
              </thead>
              <tbody>
                {report.cash.byMethod.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-muted-foreground">
                      No payments recorded in this period.
                    </td>
                  </tr>
                )}
                {report.cash.byMethod.map((m) => (
                  <tr key={m.method} className="border-t border-border">
                    <td className="py-2 capitalize">{m.method.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right tabular-nums">{money(m.moneyIn)}</td>
                    <td className="py-2 text-right tabular-nums">{money(m.moneyOut)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{money(report.cash.moneyIn)}</td>
                  <td className="py-2 text-right tabular-nums">{money(report.cash.moneyOut)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="flex items-center justify-between gap-3 p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">VAT for this period</h2>
              <p className="text-sm text-muted-foreground">
                Output {money(report.vat.output)} · Input {money(report.vat.input)}
              </p>
              <p className="text-sm font-semibold">
                {report.vat.net >= 0 ? "Payable" : "Refundable"}: {money(Math.abs(report.vat.net))}
              </p>
            </div>
            <Link
              href={`/reports/vat?from=${report.from}&to=${report.to}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Landmark className="h-4 w-4" aria-hidden />
              VAT return
            </Link>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Aging title="Customers owe you" data={report.receivables} party="Customer" />
        <Aging title="You owe suppliers" data={report.payables} party="Supplier" />
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold">Transaction ledger</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter ledger">
            {LEDGER_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Reference</th>
                <th className="py-2 font-medium">Party</th>
                <th className="py-2 text-right font-medium">Money in</th>
                <th className="py-2 text-right font-medium">Money out</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-muted-foreground">
                    Nothing recorded for this filter and period.
                  </td>
                </tr>
              )}
              {ledger.slice(0, 300).map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-2 tabular-nums text-muted-foreground">{l.date}</td>
                  <td className="py-2">
                    <TypeTag type={l.type} />
                  </td>
                  <td className="py-2 font-medium">{l.ref}</td>
                  <td className="py-2 text-muted-foreground">{l.party || "-"}</td>
                  <td className="py-2 text-right tabular-nums">{l.moneyIn ? money(l.moneyIn) : ""}</td>
                  <td className="py-2 text-right tabular-nums">{l.moneyOut ? money(l.moneyOut) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ledger.length > 300 && (
          <p className="text-xs text-muted-foreground">Showing the first 300 of {ledger.length} entries. The downloaded report has all of them.</p>
        )}
        <p className="text-xs text-muted-foreground">
          The audit report also includes {report.audit.length} recorded system actions (who did what, and when) for this period.
        </p>
      </Card>
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "good" | "bad" }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xl font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "good" && "text-primary")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Card>
  )
}

function Line({ label, value, strong, highlight }: { label: string; value: number; strong?: boolean; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border py-2 first:border-t-0",
        strong && "font-semibold",
        highlight && "rounded-md border-t-0 bg-primary px-3 text-primary-foreground",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value < 0 ? `(${money(Math.abs(value))})` : money(value)}</dd>
    </div>
  )
}

function Aging({ title, data, party }: { title: string; data: FinanceReport["receivables"]; party: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-lg font-semibold tabular-nums">{money(data.total)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.buckets.map((b) => (
          <div key={b.label} className="flex flex-col gap-0.5 rounded-md bg-muted px-3 py-2">
            <span className="text-xs text-muted-foreground">{b.label}</span>
            <span className={cn("text-sm font-medium tabular-nums", b.label === "Over 90 days" && b.amount > 0 && "text-destructive")}>
              {money(b.amount)}
            </span>
          </div>
        ))}
      </div>
      <ul className="flex max-h-56 flex-col overflow-y-auto text-sm" aria-label={`${title} list`}>
        {data.rows.length === 0 && <li className="py-2 text-muted-foreground">Nothing outstanding.</li>}
        {data.rows.map((r) => (
          <li key={`${r.ref}-${r.date}`} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{r.party || `Unknown ${party.toLowerCase()}`}</span>
              <span className="text-xs text-muted-foreground">
                {r.ref} · {r.days} days
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{money(r.balance)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function TypeTag({ type }: { type: LedgerRow["type"] }) {
  const inbound = type === "Payment in" || type === "Sale"
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs",
        inbound ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {type}
    </span>
  )
}
