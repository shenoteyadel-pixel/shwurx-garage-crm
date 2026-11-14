"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, Input, Select } from "@/components/ui"
import { cn } from "@/lib/utils"
import { COMMISSION_STATUS_LABEL, canPayout } from "@/lib/addon-commission"
import type { LedgerRow } from "@/lib/addon-sales-data"
import {
  AdvisorRates,
  AdvisorTable,
  PayoutCell,
  PayoutHistory,
  PeriodTable,
  ProductTable,
  Stat,
  aed,
  figuresOf,
  type AdvisorSummary,
  type Figures,
  type PayoutHistoryRow,
  type Runner,
} from "@/components/addon-ledger-sections"

export type { AdvisorSummary, PayoutHistoryRow }

const STATUS_FILTERS = [
  ["all", "All"],
  ["pending", "In progress"],
  ["payable", "Ready to pay"],
  ["paid", "Paid"],
  ["reversed", "Reversed"],
] as const

export function AddonLedgerClient({
  rows,
  payouts,
  range,
  presets,
  advisors,
  canPay,
  canSetTargets,
  canSeeCost,
  selfView,
}: {
  rows: LedgerRow[]
  payouts: PayoutHistoryRow[]
  range: { from: string; to: string }
  presets: { label: string; from: string; to: string }[]
  advisors: AdvisorSummary[]
  canPay: boolean
  canSetTargets: boolean
  canSeeCost: boolean
  selfView: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [status, setStatus] = useState<string>("all")
  const [advisor, setAdvisor] = useState("all")
  const [product, setProduct] = useState("all")
  const [jobQuery, setJobQuery] = useState("")

  const products = useMemo(() => [...new Set(rows.map((r) => r.name))].sort(), [rows])

  const filtered = useMemo(() => {
    const q = jobQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (advisor !== "all" && r.advisor_id !== advisor) return false
      if (product !== "all" && r.name !== product) return false
      if (q && ![r.job_number, r.customer_name, r.customer_mobile].some((v) => v?.toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, advisor, product, jobQuery])

  const shown = filtered.filter((r) => {
    if (status === "payable") return !r.payout && canPayout(r.commission)
    if (status === "paid") return Boolean(r.payout)
    if (status === "pending") return r.commission.status !== "reversed" && !r.payout && !canPayout(r.commission) && ["proposed", "approved", "completed"].includes(r.status)
    if (status === "reversed") return r.commission.status === "reversed"
    return true
  })

  const totals = useMemo(() => figuresOf(filtered), [filtered])
  const byAdvisor = useMemo(() => {
    const groups = new Map<string, LedgerRow[]>()
    for (const r of filtered) if (r.advisor_id) groups.set(r.advisor_id, [...(groups.get(r.advisor_id) ?? []), r])
    return new Map<string, Figures>([...groups].map(([id, rs]) => [id, figuresOf(rs)]))
  }, [filtered])

  const run: Runner = (fn, done) =>
    start(async () => {
      setMessage(null)
      const res = await fn()
      if (!res.ok) setMessage({ ok: false, text: res.error ?? "Something went wrong." })
      else {
        if (done) setMessage({ ok: true, text: done })
        router.refresh()
      }
    })

  const retained = totals.profit - totals.commission
  const visibleAdvisors = advisor === "all" ? advisors : advisors.filter((a) => a.id === advisor)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-balance text-2xl font-semibold">{selfView ? "My upsell commission" : "Upsell commission"}</h1>
          <p className="text-pretty text-sm text-muted-foreground">
            Commission becomes payable only after the customer approves, the work is completed and the invoice is paid.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" name="from" defaultValue={range.from} className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" name="to" defaultValue={range.to} className="h-9" />
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
          <nav aria-label="Quick ranges" className="flex flex-wrap gap-1">
            {presets.map((p) => {
              const active = p.from === range.from && p.to === range.to
              return (
                <Link
                  key={p.label}
                  href={`?from=${p.from}&to=${p.to}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {p.label}
                </Link>
              )
            })}
          </nav>
        </form>
      </header>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={cn("rounded-lg border px-3 py-2 text-sm", message.ok ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive")}
        >
          {message.text}
        </p>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upsell revenue" value={aed(totals.revenue)} sub={`${totals.approved} of ${totals.lines} lines approved`} />
        {canSeeCost ? (
          <>
            <Stat label="Gross profit" value={aed(totals.profit)} tone={totals.profit < 0 ? "bad" : undefined} />
            <Stat label="Advisor commissions" value={aed(totals.commission)} sub={`${aed(totals.paid)} paid`} />
            <Stat label="Company retained profit" value={aed(retained)} tone={retained < 0 ? "bad" : "good"} />
          </>
        ) : (
          <>
            <Stat label="Pending commission" value={aed(totals.pending)} sub="Waiting for approval, work or payment" />
            <Stat label="Ready / earned, unpaid" value={aed(totals.earnedUnpaid)} sub={`${totals.readyCount} lines ready`} />
            <Stat label="Commission paid" value={aed(totals.paid)} tone="good" />
          </>
        )}
      </section>

      {canSeeCost && (
        <section aria-label="Commission pipeline" className="grid grid-cols-3 gap-3">
          <Stat label="Pending" value={aed(totals.pending)} sub="Not yet earned" />
          <Stat label="Earned, unpaid" value={aed(totals.earnedUnpaid)} sub={`${totals.readyCount} ready to pay`} />
          <Stat label="Paid" value={aed(totals.paid)} />
        </section>
      )}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        {!selfView && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Advisor
            <Select value={advisor} onChange={(e) => setAdvisor(e.target.value)}>
              <option value="all">All advisors</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Product / service
          <Select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Job card or customer
          <Input type="search" value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="Job number, name or mobile" />
        </label>
        <Button size="sm" variant="ghost" onClick={() => exportCsv(shown, canSeeCost, range)}>
          Export CSV
        </Button>
      </Card>

      {!selfView && advisors.length > 0 && (
        <AdvisorTable
          advisors={visibleAdvisors}
          byAdvisor={byAdvisor}
          canSeeCost={canSeeCost}
          canPay={canPay}
          canSetTargets={canSetTargets}
          pending={pending}
          run={run}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <PeriodTable rows={filtered} canSeeCost={canSeeCost} />
        <ProductTable rows={filtered} canSeeCost={canSeeCost} />
      </div>

      <section aria-label="Upsell lines" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by commission status">
          {STATUS_FILTERS.map(([k, label]) => (
            <Button key={k} size="sm" variant={status === k ? "primary" : "ghost"} aria-pressed={status === k} onClick={() => setStatus(k)}>
              {label}
            </Button>
          ))}
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <caption className="sr-only">Upsell lines</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Job / customer</th>
                <th className="px-4 py-2 font-medium">Product / service</th>
                {!selfView && <th className="px-4 py-2 font-medium">Advisor</th>}
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Net</th>
                {canSeeCost && <th className="px-4 py-2 text-right font-medium">Profit</th>}
                <th className="px-4 py-2 text-right font-medium">Commission</th>
                {canPay && (
                  <th className="px-4 py-2">
                    <span className="sr-only">Payout</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${r.job_id}`} className="font-medium underline-offset-2 hover:underline">
                      {r.job_number ?? "Job"}
                    </Link>
                    <div className="text-xs text-muted-foreground">{[r.customer_name, r.customer_mobile].filter(Boolean).join(" · ") || "—"}</div>
                    {r.invoice?.number && <div className="text-xs text-muted-foreground">Invoice {r.invoice.number}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Qty {r.quantity} · {Number(r.commission_pct)}%
                    </div>
                  </td>
                  {!selfView && <td className="px-4 py-3">{r.advisor_name ?? "—"}</td>}
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        "border-border",
                        r.commission.status === "reversed"
                          ? "text-destructive"
                          : r.commission.status === "paid" || r.commission.status === "earned"
                            ? "border-primary/40 text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {COMMISSION_STATUS_LABEL[r.commission.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{aed(r.line.netAmount)}</td>
                  {canSeeCost && (
                    <td className={cn("px-4 py-3 text-right tabular-nums", r.line.grossProfit < 0 && "text-destructive")}>{aed(r.line.grossProfit)}</td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div>{aed(r.commission.earned)}</div>
                    {r.commission.earned !== r.commission.potential && (
                      <div className="text-xs text-muted-foreground">of {aed(r.commission.potential)}</div>
                    )}
                  </td>
                  {canPay && (
                    <td className="px-4 py-3 text-right">
                      <PayoutCell row={r} pending={pending} run={run} />
                    </td>
                  )}
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No upsell lines match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <PayoutHistory payouts={advisor === "all" ? payouts : payouts.filter((p) => advisors.find((a) => a.id === advisor)?.name === p.advisor_name)} selfView={selfView} />

      {canSetTargets && !selfView && <AdvisorRates advisors={advisors} pending={pending} run={run} />}
    </main>
  )
}

function exportCsv(rows: LedgerRow[], canSeeCost: boolean, range: { from: string; to: string }) {
  const header = ["Date", "Job", "Customer", "Mobile", "Product", "Advisor", "Status", "Qty", "Net", ...(canSeeCost ? ["Profit"] : []), "Rate %", "Commission potential", "Commission earned", "Paid"]
  const cell = (v: unknown) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map((r) =>
    [
      r.created_at.slice(0, 10),
      r.job_number,
      r.customer_name,
      r.customer_mobile,
      r.name,
      r.advisor_name,
      COMMISSION_STATUS_LABEL[r.commission.status],
      r.quantity,
      r.line.netAmount.toFixed(2),
      ...(canSeeCost ? [r.line.grossProfit.toFixed(2)] : []),
      r.commission_pct,
      r.commission.potential.toFixed(2),
      r.commission.earned.toFixed(2),
      r.payout ? Number(r.payout.amount).toFixed(2) : "",
    ]
      .map(cell)
      .join(","),
  )
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `upsell-commission-${range.from}-to-${range.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
