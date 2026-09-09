"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { formatCurrency as money } from "@/lib/utils"
import { Card, PrimaryButton, GhostButton } from "@/components/ui"
import { DEPARTMENTS, type DepartmentKey, type DepartmentTotal, type LabourReportRow } from "@/lib/labour-report"

const BAR_BY_KEY: Record<DepartmentKey, string> = DEPARTMENTS.reduce(
  (acc, d) => {
    acc[d.key] = d.bar
    return acc
  },
  {} as Record<DepartmentKey, string>,
)

function fmtHours(h: number) {
  return `${h.toLocaleString(undefined, { minimumFractionDigits: h % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })} h`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function LabourReportClient({
  from,
  to,
  departments,
  rows,
}: {
  from: string
  to: string
  departments: DepartmentTotal[]
  rows: LabourReportRow[]
}) {
  const router = useRouter()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  function apply() {
    router.push(`/reports/labour?from=${f}&to=${t}`)
  }

  function preset(kind: "month" | "quarter" | "year") {
    const now = new Date()
    let start: Date
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    if (kind === "month") start = new Date(now.getFullYear(), now.getMonth(), 1)
    else if (kind === "quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    else start = new Date(now.getFullYear(), 0, 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    router.push(`/reports/labour?from=${fmt(start)}&to=${fmt(kind === "year" ? new Date(now.getFullYear(), 11, 31) : end)}`)
  }

  const totalHours = departments.reduce((s, d) => s + d.hours, 0)
  const totalAmount = departments.reduce((s, d) => s + d.amount, 0)
  const totalLines = departments.reduce((s, d) => s + d.lineCount, 0)
  const maxHours = Math.max(1, ...departments.map((d) => d.hours))

  function exportCsv() {
    downloadCsv(`labour-hours-${from}-to-${to}.csv`, [
      ["Date", "Job", "Department", "Description", "Category", "Hours", "Rate", "Amount"],
      ...rows.map((r) => [
        r.date,
        r.jobNumber,
        DEPARTMENTS.find((d) => d.key === r.department)?.label ?? r.department,
        r.description,
        r.category,
        r.hours.toFixed(1),
        r.rate.toFixed(2),
        r.amount.toFixed(2),
      ]),
      [],
      ["", "", "", "", "TOTAL", totalHours.toFixed(1), "", totalAmount.toFixed(2)],
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Labour Hours</h1>
          <p className="text-sm text-muted-foreground">Labour by department for the selected period.</p>
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

      {/* Report switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/reports?from=${from}&to=${to}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Financial
        </Link>
        <span className="rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-foreground">
          Labour Hours
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <GhostButton onClick={() => preset("month")}>This Month</GhostButton>
          <GhostButton onClick={() => preset("quarter")}>This Quarter</GhostButton>
          <GhostButton onClick={() => preset("year")}>This Year</GhostButton>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total labour hours" value={fmtHours(totalHours)} />
        <Metric label="Labour value" value={money(totalAmount)} tone="pos" />
        <Metric label="Labour lines" value={String(totalLines)} />
        <Metric label="Departments" value={String(departments.filter((d) => d.hours > 0).length)} sub="with logged hours" />
      </div>

      {/* Department breakdown bars */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Hours by department</h2>
          <GhostButton onClick={exportCsv}>Export CSV</GhostButton>
        </div>
        {totalHours === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No labour hours recorded in this period. Labour is read from quotation labour lines.
          </p>
        ) : (
          <div className="space-y-4">
            {departments.map((d) => {
              const pct = Math.round((d.hours / totalHours) * 100)
              return (
                <div key={d.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${BAR_BY_KEY[d.key]}`} />
                      {d.label}
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{fmtHours(d.hours)}</span> · {money(d.amount)} ·{" "}
                      {d.jobCount} {d.jobCount === 1 ? "job" : "jobs"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${BAR_BY_KEY[d.key]}`}
                        style={{ width: `${Math.max(2, (d.hours / maxHours) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Detail table */}
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Labour lines</h2>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No labour lines in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Job</th>
                  <th className="pb-2 pr-3 font-medium">Department</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 text-right font-medium">Hours</th>
                  <th className="pb-2 pl-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground">{r.date}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.jobNumber}</td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${BAR_BY_KEY[r.department]}`} />
                        {DEPARTMENTS.find((d) => d.key === r.department)?.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{r.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.hours ? r.hours.toFixed(1) : "—"}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3 pr-3" colSpan={4}>
                    Total
                  </td>
                  <td className="pt-3 pr-3 text-right tabular-nums">{totalHours.toFixed(1)}</td>
                  <td className="pt-3 pl-3 text-right tabular-nums">{money(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Labour hours are aggregated from the latest quotation per job in the selected period, grouped into departments
        from each line&apos;s category and description.
      </p>
    </div>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" }) {
  const color = tone === "pos" ? "text-emerald-500" : "text-foreground"
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  )
}
