"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, Input } from "@/components/ui"
import { cn } from "@/lib/utils"
import { COMMISSION_STATUS_LABEL, canPayout } from "@/lib/addon-commission"
import type { LedgerRow } from "@/lib/addon-sales-data"
import { recordCommissionPayout, reverseCommissionPayout, setAddonTarget } from "@/lib/actions-addon-sales"

const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export type AdvisorSummary = { id: string; name: string; target: number }

export function AddonLedgerClient({
  rows,
  month,
  advisors,
  canPay,
  canSetTargets,
  canSeeCost,
  selfView,
}: {
  rows: LedgerRow[]
  month: string
  advisors: AdvisorSummary[]
  canPay: boolean
  canSetTargets: boolean
  canSeeCost: boolean
  selfView: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("all")

  const totals = useMemo(() => {
    const t = { proposed: 0, approved: 0, completed: 0, revenue: 0, profit: 0, potential: 0, earned: 0, paid: 0, decided: 0 }
    for (const r of rows) {
      t.proposed += 1
      if (["approved", "completed"].includes(r.status)) {
        t.approved += 1
        t.revenue += r.line.netAmount
        t.profit += r.line.grossProfit
      }
      if (["approved", "completed", "rejected"].includes(r.status)) t.decided += 1
      if (r.status === "completed") t.completed += 1
      t.potential += r.commission.potential
      t.earned += r.commission.earned
      if (r.payout) t.paid += Number(r.payout.amount)
    }
    return t
  }, [rows])

  const byAdvisor = useMemo(() => {
    const m = new Map<string, { revenue: number; earned: number; count: number }>()
    for (const r of rows) {
      if (!r.advisor_id) continue
      const a = m.get(r.advisor_id) ?? { revenue: 0, earned: 0, count: 0 }
      if (["approved", "completed"].includes(r.status)) {
        a.revenue += r.line.netAmount
        a.count += 1
      }
      a.earned += r.commission.earned
      m.set(r.advisor_id, a)
    }
    return m
  }, [rows])

  const shown = rows.filter((r) => {
    if (filter === "payable") return canPayout(r.commission)
    if (filter === "pending") return ["proposed", "approved"].includes(r.status) || r.commission.status === "invoiced" || r.commission.status === "work_completed"
    if (filter === "reversed") return r.commission.status === "reversed"
    return true
  })

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (!res.ok) setError(res.error ?? "Something went wrong.")
      else router.refresh()
    })

  const conversion = totals.decided ? Math.round((totals.approved / totals.decided) * 100) : 0

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-balance text-2xl font-semibold">{selfView ? "My add-on sales" : "Add-on sales & commission"}</h1>
          <p className="text-sm text-muted-foreground">Commission is earned only on approved, completed and paid work.</p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Month
            <Input type="month" name="month" defaultValue={month} />
          </label>
          <Button type="submit" size="sm" variant="ghost">
            Show
          </Button>
        </form>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Approved revenue" value={aed(totals.revenue)} sub={`${totals.approved} of ${totals.proposed} lines`} />
        <Stat label="Conversion" value={`${conversion}%`} sub={`${totals.completed} completed`} />
        <Stat label="Commission earned" value={aed(totals.earned)} sub={`${aed(totals.potential)} potential`} />
        <Stat label="Commission paid" value={aed(totals.paid)} sub={`${aed(Math.max(0, totals.earned - totals.paid))} outstanding`} />
      </section>

      {advisors.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="px-4 pt-3 text-left text-sm font-semibold">Advisors this month</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Advisor</th>
                <th className="px-4 py-2 text-right font-medium">Approved revenue</th>
                <th className="px-4 py-2 font-medium">Target progress</th>
                <th className="px-4 py-2 text-right font-medium">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {advisors.map((a) => {
                const s = byAdvisor.get(a.id) ?? { revenue: 0, earned: 0, count: 0 }
                const pct = a.target > 0 ? Math.min(100, Math.round((s.revenue / a.target) * 100)) : 0
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{aed(s.revenue)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.name} target progress`}>
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        {canSetTargets ? (
                          <TargetInput advisorId={a.id} initial={a.target} pending={pending} run={run} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{a.target > 0 ? `${pct}% of ${aed(a.target)}` : "No target"}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{aed(s.earned)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter lines">
        {[
          ["all", "All"],
          ["pending", "In progress"],
          ["payable", "Ready to pay"],
          ["reversed", "Reversed"],
        ].map(([k, label]) => (
          <Button key={k} size="sm" variant={filter === k ? "primary" : "ghost"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
          </Button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Add-on sale lines</caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Job / add-on</th>
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
                <td className="px-4 py-3">
                  <Link href={`/jobs/${r.job_id}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    {r.job_number ?? "Job"}
                  </Link>
                  <div className="font-medium">{r.name}</div>
                  {r.invoice?.number && <div className="text-xs text-muted-foreground">Invoice {r.invoice.number}</div>}
                </td>
                {!selfView && <td className="px-4 py-3">{r.advisor_name ?? "—"}</td>}
                <td className="px-4 py-3">
                  <Badge className={cn("border-border", r.commission.status === "reversed" ? "text-destructive" : r.commission.status === "paid" || r.commission.status === "earned" ? "border-primary/40 text-primary" : "text-muted-foreground")}>
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
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No add-on sales for this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  )
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>) => void

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </Card>
  )
}

function TargetInput({ advisorId, initial, pending, run }: { advisorId: string; initial: number; pending: boolean; run: Runner }) {
  const [value, setValue] = useState(String(initial || ""))
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setAddonTarget(advisorId, Number(value) || 0))
      }}
    >
      <label className="sr-only" htmlFor={`target-${advisorId}`}>
        Monthly target (AED)
      </label>
      <Input id={`target-${advisorId}`} className="h-8 w-24" type="number" min="0" placeholder="Target" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" variant="ghost" type="submit" disabled={pending}>
        Set
      </Button>
    </form>
  )
}

function PayoutCell({ row, pending, run }: { row: LedgerRow; pending: boolean; run: Runner }) {
  const [mode, setMode] = useState<null | "pay" | "reverse">(null)
  const [ref, setRef] = useState("")
  const [reason, setReason] = useState("")

  if (row.payout && mode !== "reverse") {
    return (
      <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
        <span>Paid {row.payout.paid_at}</span>
        <Button size="sm" variant="ghost" onClick={() => setMode("reverse")}>
          Reverse
        </Button>
      </div>
    )
  }
  if (mode === "reverse" && row.payout) {
    return (
      <form
        className="flex flex-col items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => reverseCommissionPayout(row.payout!.id, reason))
          setMode(null)
        }}
      >
        <Input aria-label="Reason for reversal" required placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" type="submit" disabled={pending}>
          Confirm reversal
        </Button>
      </form>
    )
  }
  if (!canPayout(row.commission)) return null
  if (mode === "pay") {
    return (
      <form
        className="flex flex-col items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => recordCommissionPayout(row.id, { method: "salary", reference: ref, note: "" }))
          setMode(null)
        }}
      >
        <Input aria-label="Payment reference" placeholder="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <Button size="sm" type="submit" disabled={pending}>
          Pay {aed(row.commission.earned)}
        </Button>
      </form>
    )
  }
  return (
    <Button size="sm" onClick={() => setMode("pay")}>
      Record payout
    </Button>
  )
}
