"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Building2, Download, User } from "lucide-react"
import { formatCurrency as money } from "@/lib/utils"
import { Card, PrimaryButton, GhostButton } from "@/components/ui"

export type RankedRow = {
  rank: number
  id: string | null
  name: string
  contact: string | null
  mobile: string | null
  total: number
  paid: number
  invoices: number
  lastVisit: string | null
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function TopCustomersClient({
  from,
  to,
  customers,
  companies,
}: {
  from: string
  to: string
  customers: RankedRow[]
  companies: RankedRow[]
}) {
  const router = useRouter()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  const go = (a: string, b: string) => router.push(`/reports/top-customers?from=${a}&to=${b}`)

  function preset(kind: "month" | "quarter" | "year" | "all") {
    const now = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    if (kind === "all") return go("2000-01-01", fmt(new Date(now.getFullYear(), 11, 31)))
    if (kind === "year") return go(`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`)
    const start =
      kind === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    go(fmt(start), fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Top Customers</h1>
          <p className="text-sm text-muted-foreground">Top 20 customers and top 20 companies by invoiced amount.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="tc-from" className="mb-1 block text-xs text-muted-foreground">From</label>
            <input
              id="tc-from"
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="tc-to" className="mb-1 block text-xs text-muted-foreground">To</label>
            <input
              id="tc-to"
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
          href={`/reports?from=${from}&to=${to}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Financial
        </Link>
        <span className="rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-foreground">
          Top Customers
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <GhostButton onClick={() => preset("month")}>This Month</GhostButton>
          <GhostButton onClick={() => preset("quarter")}>This Quarter</GhostButton>
          <GhostButton onClick={() => preset("year")}>This Year</GhostButton>
          <GhostButton onClick={() => preset("all")}>All Time</GhostButton>
        </div>
      </div>

      <RankTable
        title="Top 20 Customers"
        icon={<User className="size-4" aria-hidden />}
        rows={customers}
        empty="No customer invoices in this period."
        filename={`top-customers-${from}-to-${to}.csv`}
      />
      <RankTable
        title="Top 20 Companies"
        icon={<Building2 className="size-4" aria-hidden />}
        rows={companies}
        showContact
        empty="No company invoices in this period. Mark a customer as a company (or add a company name) to rank it here."
        filename={`top-companies-${from}-to-${to}.csv`}
      />
    </div>
  )
}

function RankTable({
  title,
  icon,
  rows,
  empty,
  filename,
  showContact = false,
}: {
  title: string
  icon: React.ReactNode
  rows: RankedRow[]
  empty: string
  filename: string
  showContact?: boolean
}) {
  const grand = rows.reduce((s, r) => s + r.total, 0)
  const top = rows[0]?.total || 1

  function exportCsv() {
    downloadCsv(filename, [
      ["Rank", "Name", ...(showContact ? ["Contact"] : []), "Mobile", "Invoices", "Total", "Paid", "Balance", "Last Visit"],
      ...rows.map((r) => [
        r.rank,
        r.name,
        ...(showContact ? [r.contact ?? ""] : []),
        r.mobile ?? "",
        r.invoices,
        r.total.toFixed(2),
        r.paid.toFixed(2),
        (r.total - r.paid).toFixed(2),
        r.lastVisit ?? "",
      ]),
    ])
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">
            {rows.length} · {money(grand)}
          </span>
        </div>
        <GhostButton onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-1 size-4" aria-hidden />
          CSV
        </GhostButton>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-2">#</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2 text-right">Invoices</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2">Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const balance = r.total - r.paid
                return (
                  <tr key={`${r.rank}-${r.name}`} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-muted-foreground">{r.rank}</td>
                    <td className="px-4 py-2">
                      {r.id ? (
                        <Link href={`/customers/${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {[showContact ? r.contact : null, r.mobile].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 h-1 w-full max-w-48 rounded-full bg-muted" aria-hidden>
                        <div className="h-1 rounded-full bg-primary" style={{ width: `${(r.total / top) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.invoices}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${balance > 0.009 ? "text-destructive" : "text-muted-foreground"}`}>
                      {money(balance)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.lastVisit ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
