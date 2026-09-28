"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AlertTriangle, Download, FileText } from "lucide-react"
import { formatCurrency as money } from "@/lib/utils"
import { PrimaryButton, GhostButton } from "@/components/ui"
import type { VatReport, VatBox } from "@/lib/vat-report"

type Company = { name: string; trn: string | null; address: string | null }

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const n2 = (v: number) => v.toFixed(2)

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n")
  // BOM so Excel opens UTF-8 (Arabic names) correctly.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function VatReportView({ report, company }: { report: VatReport; company: Company }) {
  const router = useRouter()
  const [f, setF] = useState(report.from)
  const [t, setT] = useState(report.to)
  const qs = `from=${report.from}&to=${report.to}`

  function go(from: string, to: string) {
    router.push(`/reports/vat?from=${from}&to=${to}`)
  }

  function preset(kind: "quarter" | "lastQuarter" | "month" | "lastMonth") {
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3)
    if (kind === "quarter") go(fmt(new Date(now.getFullYear(), q * 3, 1)), fmt(new Date(now.getFullYear(), q * 3 + 3, 0)))
    if (kind === "lastQuarter")
      go(fmt(new Date(now.getFullYear(), q * 3 - 3, 1)), fmt(new Date(now.getFullYear(), q * 3, 0)))
    if (kind === "month") go(fmt(new Date(now.getFullYear(), now.getMonth(), 1)), fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
    if (kind === "lastMonth") go(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), fmt(new Date(now.getFullYear(), now.getMonth(), 0)))
  }

  function exportCsv() {
    const box = (b: VatBox) => [b.box, b.label, n2(b.amount), n2(b.vat), n2(b.adjustment ?? 0)]
    downloadCsv(`VAT201-${report.from}-to-${report.to}.csv`, [
      ["VAT Return (VAT 201) - Federal Tax Authority, UAE"],
      ["Taxable person", company.name],
      ["TRN", company.trn ?? ""],
      ["Tax period", `${report.from} to ${report.to}`],
      ["Currency", "AED"],
      [],
      ["VAT on sales and all other outputs"],
      ["Box", "Description", "Amount (AED)", "VAT amount (AED)", "Adjustment (AED)"],
      ...report.outputBoxes.map(box),
      ["8", "Totals", n2(report.box8.amount), n2(report.box8.vat), ""],
      [],
      ["VAT on expenses and all other inputs"],
      ["Box", "Description", "Amount (AED)", "Recoverable VAT (AED)", "Adjustment (AED)"],
      ...report.inputBoxes.map(box),
      ["11", "Totals", n2(report.box11.amount), n2(report.box11.vat), ""],
      [],
      ["Net VAT due"],
      ["12", "Total value of due tax for the period", "", n2(report.box12)],
      ["13", "Total value of recoverable tax for the period", "", n2(report.box13)],
      ["14", "Payable tax for the period", "", n2(report.box14)],
      [],
      ["Sales tax invoice register"],
      ["Invoice no.", "Date", "Customer", "Customer TRN", "Treatment", "Place of supply", "Net (AED)", "VAT (AED)", "Total (AED)"],
      ...report.sales.map((s) => [
        s.number,
        s.date,
        s.customer,
        s.customerTrn ?? "",
        s.treatment === "standard" ? "Standard rated 5%" : "Zero rated",
        "Dubai",
        n2(s.net),
        n2(s.vat),
        n2(s.total),
      ]),
      [],
      ["Purchase tax invoice register"],
      ["Invoice no.", "Date", "Supplier", "Supplier TRN", "Net (AED)", "VAT (AED)", "Total (AED)", "Input VAT recoverable", "Note"],
      ...report.purchases.map((p) => [
        p.number,
        p.date,
        p.supplier,
        p.supplierTrn ?? "",
        n2(p.net),
        n2(p.vat),
        n2(p.total),
        p.recoverable ? "Yes" : "No",
        p.reason ?? "",
      ]),
    ])
  }

  const payable = report.box14 >= 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VAT Return (VAT 201)</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {company.name} · TRN {company.trn || "not set"} · FTA format, amounts in AED
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="vat-from" className="mb-1 block text-xs text-muted-foreground">
              From
            </label>
            <input
              id="vat-from"
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="vat-to" className="mb-1 block text-xs text-muted-foreground">
              To
            </label>
            <input
              id="vat-to"
              type="date"
              value={t}
              onChange={(e) => setT(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <PrimaryButton onClick={() => go(f, t)}>Apply</PrimaryButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/reports?${qs}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Financial
        </Link>
        <Link
          href={`/reports/labour?${qs}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Labour Hours
        </Link>
        <span className="rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-foreground">VAT</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <GhostButton onClick={() => preset("quarter")}>This Quarter</GhostButton>
          <GhostButton onClick={() => preset("lastQuarter")}>Last Quarter</GhostButton>
          <GhostButton onClick={() => preset("month")}>This Month</GhostButton>
          <GhostButton onClick={() => preset("lastMonth")}>Last Month</GhostButton>
        </div>
      </div>

      {/* Net position */}
      <section className="grid gap-4 md:grid-cols-4" aria-label="VAT summary">
        <Summary label="Output VAT (Box 12)" value={money(report.box12)} sub={`${report.sales.length} sales invoices`} />
        <Summary label="Recoverable input VAT (Box 13)" value={money(report.box13)} sub={`${report.purchases.length} purchase invoices`} />
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 md:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {payable ? "Payable tax for the period (Box 14)" : "Refundable tax for the period (Box 14)"}
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-primary tabular-nums">{money(Math.abs(report.box14))}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/reports/vat/print?${qs}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <FileText className="h-4 w-4" aria-hidden /> Download PDF
            </a>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" aria-hidden /> Download Excel (CSV)
            </button>
          </div>
        </div>
      </section>

      {report.blockedCount > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <p className="text-pretty">
            {money(report.blockedInputVat)} input VAT on {report.blockedCount} purchase invoice(s) is excluded from Box 9
            because the supplier TRN is missing or invalid. Under UAE VAT law input tax can only be recovered against a
            valid tax invoice. Add the supplier TRN to recover it.
          </p>
        </div>
      )}

      <BoxTable
        title="VAT on sales and all other outputs"
        vatHeader="VAT amount"
        boxes={report.outputBoxes}
        total={{ box: "8", ...report.box8 }}
      />
      <BoxTable
        title="VAT on expenses and all other inputs"
        vatHeader="Recoverable VAT"
        boxes={report.inputBoxes}
        total={{ box: "11", ...report.box11 }}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Net VAT due</h2>
        <dl className="divide-y divide-border text-sm">
          <NetRow box="12" label="Total value of due tax for the period" value={report.box12} />
          <NetRow box="13" label="Total value of recoverable tax for the period" value={report.box13} />
          <NetRow box="14" label="Payable tax for the period" value={report.box14} strong />
        </dl>
      </section>

      <Register
        title="Sales tax invoices"
        empty="No sales invoices in this period."
        head={["Invoice", "Date", "Customer", "TRN", "Net", "VAT", "Total"]}
        rows={report.sales.map((s) => [s.number, s.date, s.customer, s.customerTrn || "—", money(s.net), money(s.vat), money(s.total)])}
      />
      <Register
        title="Purchase tax invoices"
        empty="No confirmed purchase invoices in this period."
        head={["Invoice", "Date", "Supplier", "TRN", "Net", "VAT", "Recoverable"]}
        rows={report.purchases.map((p) => [
          p.number,
          p.date,
          p.supplier,
          p.supplierTrn || "—",
          money(p.net),
          money(p.vat),
          p.recoverable ? "Yes" : p.reason ?? "No",
        ])}
        flag={report.purchases.map((p) => !p.recoverable && p.vat > 0)}
      />

      <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
        Prepared under Federal Decree-Law No. 8 of 2017 on VAT. Sales are standard rated at 5% with Dubai as the place of
        supply. Zero-VAT invoices are shown as zero rated. Review the figures before filing on EmaraTax, and keep tax
        records for at least 5 years.
      </p>
    </div>
  )
}

function Summary({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function BoxTable({
  title,
  vatHeader,
  boxes,
  total,
}: {
  title: string
  vatHeader: string
  boxes: VatBox[]
  total: { box: string; amount: number; vat: number }
}) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 font-semibold">{title}</h2>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-14 px-4 py-2 font-medium">Box</th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 text-right font-medium">Amount (AED)</th>
            <th className="px-4 py-2 text-right font-medium">{vatHeader} (AED)</th>
            <th className="px-4 py-2 text-right font-medium">Adjustment (AED)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {boxes.map((b) => (
            <tr key={b.box} className={b.amount || b.vat ? "" : "text-muted-foreground"}>
              <td className="px-4 py-2 font-mono text-xs">{b.box}</td>
              <td className="px-4 py-2">{b.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">{n2(b.amount)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{n2(b.vat)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{b.adjustment === undefined ? "" : n2(b.adjustment)}</td>
            </tr>
          ))}
          <tr className="bg-accent/50 font-semibold">
            <td className="px-4 py-2 font-mono text-xs">{total.box}</td>
            <td className="px-4 py-2">Totals</td>
            <td className="px-4 py-2 text-right tabular-nums">{n2(total.amount)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{n2(total.vat)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function NetRow({ box, label, value, strong }: { box: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${strong ? "font-semibold" : ""}`}>
      <dt className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">{box}</span>
        {label}
      </dt>
      <dd className={`tabular-nums ${strong ? "text-primary" : ""}`}>{money(value)}</dd>
    </div>
  )
}

function Register({
  title,
  head,
  rows,
  empty,
  flag,
}: {
  title: string
  head: string[]
  rows: string[][]
  empty: string
  flag?: boolean[]
}) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              {head.map((h, i) => (
                <th key={h} className={`px-4 py-2 font-medium ${i >= 4 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, idx) => (
              <tr key={idx} className={flag?.[idx] ? "bg-amber-500/5" : ""}>
                {r.map((c, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2 ${i >= 4 ? "text-right tabular-nums" : ""} ${
                      flag?.[idx] && i === r.length - 1 ? "text-amber-500" : ""
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
