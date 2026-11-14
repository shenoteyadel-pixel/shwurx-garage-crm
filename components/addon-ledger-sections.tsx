"use client"

import { useState } from "react"
import { Button, Card, Input } from "@/components/ui"
import { cn } from "@/lib/utils"
import { canPayout } from "@/lib/addon-commission"
import type { LedgerRow } from "@/lib/addon-sales-data"
import {
  payAllReadyForAdvisor,
  recordCommissionPayout,
  reverseCommissionPayout,
  setAddonTarget,
  setAdvisorCommissionRate,
} from "@/lib/actions-addon-sales"

export const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void
export type AdvisorSummary = { id: string; name: string; target: number; rate: number | null }
export type PayoutHistoryRow = {
  id: string
  advisor_name: string
  job_number: string | null
  item_name: string
  amount: number
  paid_at: string
  reference: string | null
  reversed_at: string | null
  reverse_reason: string | null
}

export type Figures = {
  lines: number
  approved: number
  revenue: number
  profit: number
  commission: number
  pending: number
  earnedUnpaid: number
  paid: number
  readyCount: number
}

const LIVE = new Set(["approved", "completed"])

export function figuresOf(rows: LedgerRow[]): Figures {
  const f: Figures = { lines: 0, approved: 0, revenue: 0, profit: 0, commission: 0, pending: 0, earnedUnpaid: 0, paid: 0, readyCount: 0 }
  for (const r of rows) {
    f.lines += 1
    if (LIVE.has(r.status)) {
      f.approved += 1
      f.revenue += r.line.netAmount
      f.profit += r.line.grossProfit
      if (r.commission.status !== "reversed") f.commission += r.commission.potential
    }
    if (r.commission.status !== "reversed") f.pending += r.commission.pending
    if (r.payout) f.paid += Number(r.payout.amount)
    else if (r.commission.status !== "reversed") f.earnedUnpaid += r.commission.earned
    if (!r.payout && canPayout(r.commission)) f.readyCount += 1
  }
  return f
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "good" && "text-primary")}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Card>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-4 py-2 font-medium", right && "text-right")}>{children}</th>
}

/* -------- Advisor comparison -------- */

export function AdvisorTable({
  advisors,
  byAdvisor,
  canSeeCost,
  canPay,
  canSetTargets,
  pending,
  run,
}: {
  advisors: AdvisorSummary[]
  byAdvisor: Map<string, Figures>
  canSeeCost: boolean
  canPay: boolean
  canSetTargets: boolean
  pending: boolean
  run: Runner
}) {
  const ranked = [...advisors].sort((a, b) => (byAdvisor.get(b.id)?.revenue ?? 0) - (byAdvisor.get(a.id)?.revenue ?? 0))
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <caption className="px-4 pt-3 text-left text-sm font-semibold">Advisor performance</caption>
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <Th>Advisor</Th>
            <Th right>Lines sold</Th>
            <Th right>Revenue</Th>
            {canSeeCost && <Th right>Profit</Th>}
            <Th right>Pending</Th>
            <Th right>Earned, unpaid</Th>
            <Th right>Paid</Th>
            <Th>Target</Th>
            {canPay && (
              <th className="px-4 py-2">
                <span className="sr-only">Pay</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ranked.map((a) => {
            const s = byAdvisor.get(a.id) ?? figuresOf([])
            const pct = a.target > 0 ? Math.min(100, Math.round((s.revenue / a.target) * 100)) : 0
            return (
              <tr key={a.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.rate === null ? "Product rate" : `${a.rate}% rate`}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.approved}</td>
                <td className="px-4 py-3 text-right tabular-nums">{aed(s.revenue)}</td>
                {canSeeCost && <td className={cn("px-4 py-3 text-right tabular-nums", s.profit < 0 && "text-destructive")}>{aed(s.profit)}</td>}
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{aed(s.pending)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{aed(s.earnedUnpaid)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{aed(s.paid)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-2 w-28 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${a.name} upsell target progress`}
                    >
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    {canSetTargets ? (
                      <TargetInput advisorId={a.id} initial={a.target} pending={pending} run={run} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.target > 0 ? `${pct}% of ${aed(a.target)}` : "No target"}</span>
                    )}
                  </div>
                </td>
                {canPay && (
                  <td className="px-4 py-3 text-right">
                    {s.readyCount > 0 && <PayAllButton advisor={a} count={s.readyCount} amount={s.earnedUnpaid} pending={pending} run={run} />}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function PayAllButton({ advisor, count, amount, pending, run }: { advisor: AdvisorSummary; count: number; amount: number; pending: boolean; run: Runner }) {
  const [open, setOpen] = useState(false)
  const [ref, setRef] = useState("")
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Pay {count} ready
      </Button>
    )
  }
  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => payAllReadyForAdvisor(advisor.id, ref), `Paid ready commission for ${advisor.name}.`)
        setOpen(false)
      }}
    >
      <Input aria-label="Payment reference" placeholder="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={pending}>
          Confirm up to {aed(amount)}
        </Button>
      </div>
    </form>
  )
}

function TargetInput({ advisorId, initial, pending, run }: { advisorId: string; initial: number; pending: boolean; run: Runner }) {
  const [value, setValue] = useState(String(initial || ""))
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setAddonTarget(advisorId, Number(value) || 0), "Target saved.")
      }}
    >
      <label className="sr-only" htmlFor={`target-${advisorId}`}>
        Monthly upsell target (AED)
      </label>
      <Input id={`target-${advisorId}`} className="h-8 w-24" type="number" min="0" placeholder="Target" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" variant="ghost" type="submit" disabled={pending}>
        Set
      </Button>
    </form>
  )
}

/* -------- Period breakdown -------- */

type Grain = "day" | "week" | "month"

function bucketOf(iso: string, grain: Grain) {
  const day = iso.slice(0, 10)
  if (grain === "day") return day
  if (grain === "month") return day.slice(0, 7)
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return `Week of ${d.toISOString().slice(0, 10)}`
}

export function PeriodTable({ rows, canSeeCost }: { rows: LedgerRow[]; canSeeCost: boolean }) {
  const [grain, setGrain] = useState<Grain>("day")
  const groups = new Map<string, LedgerRow[]>()
  for (const r of rows) {
    const k = bucketOf(r.created_at, grain)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const list = [...groups].sort((a, b) => b[0].localeCompare(a[0]))
  return (
    <Card className="flex flex-col gap-3 overflow-x-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Sales by period</h2>
        <div className="flex gap-1" role="group" aria-label="Group by">
          {(["day", "week", "month"] as Grain[]).map((g) => (
            <Button key={g} size="sm" variant={grain === g ? "primary" : "ghost"} aria-pressed={grain === g} onClick={() => setGrain(g)}>
              {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
            </Button>
          ))}
        </div>
      </div>
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <Th>Period</Th>
            <Th right>Lines sold</Th>
            <Th right>Revenue</Th>
            {canSeeCost && <Th right>Profit</Th>}
            <Th right>Commission</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {list.map(([k, rs]) => {
            const f = figuresOf(rs)
            return (
              <tr key={k}>
                <td className="px-4 py-2">{k}</td>
                <td className="px-4 py-2 text-right tabular-nums">{f.approved}</td>
                <td className="px-4 py-2 text-right tabular-nums">{aed(f.revenue)}</td>
                {canSeeCost && <td className="px-4 py-2 text-right tabular-nums">{aed(f.profit)}</td>}
                <td className="px-4 py-2 text-right tabular-nums">{aed(f.commission)}</td>
              </tr>
            )
          })}
          {!list.length && (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                No sales in this range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* -------- Best sellers -------- */

export function ProductTable({ rows, canSeeCost }: { rows: LedgerRow[]; canSeeCost: boolean }) {
  const m = new Map<string, { qty: number; revenue: number; profit: number; count: number }>()
  for (const r of rows) {
    if (!LIVE.has(r.status)) continue
    const p = m.get(r.name) ?? { qty: 0, revenue: 0, profit: 0, count: 0 }
    p.qty += Number(r.quantity) || 0
    p.revenue += r.line.netAmount
    p.profit += r.line.grossProfit
    p.count += 1
    m.set(r.name, p)
  }
  const list = [...m].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10)
  return (
    <Card className="flex flex-col gap-3 overflow-x-auto p-4">
      <h2 className="text-sm font-semibold">Best-selling add-ons</h2>
      <table className="w-full min-w-[420px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <Th>Product / service</Th>
            <Th right>Qty</Th>
            <Th right>Revenue</Th>
            {canSeeCost && <Th right>Profit</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {list.map(([name, p]) => (
            <tr key={name}>
              <td className="px-4 py-2">{name}</td>
              <td className="px-4 py-2 text-right tabular-nums">{p.qty}</td>
              <td className="px-4 py-2 text-right tabular-nums">{aed(p.revenue)}</td>
              {canSeeCost && <td className="px-4 py-2 text-right tabular-nums">{aed(p.profit)}</td>}
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                Nothing sold yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* -------- Payout history -------- */

export function PayoutHistory({ payouts, selfView }: { payouts: PayoutHistoryRow[]; selfView: boolean }) {
  return (
    <Card className="flex flex-col gap-3 overflow-x-auto p-4">
      <h2 className="text-sm font-semibold">Commission payment history</h2>
      <table className="w-full min-w-[620px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <Th>Date</Th>
            {!selfView && <Th>Advisor</Th>}
            <Th>Job / add-on</Th>
            <Th>Reference</Th>
            <Th right>Amount</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payouts.map((p) => (
            <tr key={p.id} className={cn(p.reversed_at && "text-muted-foreground")}>
              <td className="px-4 py-2">{p.paid_at}</td>
              {!selfView && <td className="px-4 py-2">{p.advisor_name}</td>}
              <td className="px-4 py-2">
                {p.job_number ?? "Job"} · {p.item_name}
                {p.reversed_at && <div className="text-xs text-destructive">Reversed: {p.reverse_reason}</div>}
              </td>
              <td className="px-4 py-2">{p.reference || "—"}</td>
              <td className={cn("px-4 py-2 text-right tabular-nums", p.reversed_at && "line-through")}>{aed(p.amount)}</td>
            </tr>
          ))}
          {!payouts.length && (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                No payments in this range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* -------- Advisor commission rates (admin) -------- */

export function AdvisorRates({ advisors, pending, run }: { advisors: AdvisorSummary[]; pending: boolean; run: Runner }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Advisor commission rates</h2>
        <p className="text-xs text-muted-foreground text-pretty">
          Applies to new upsell lines only. Lines already added keep the rate they were created with. Leave blank to use each product&apos;s own rate.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {advisors.map((a) => (
          <RateRow key={a.id} advisor={a} pending={pending} run={run} />
        ))}
      </div>
    </Card>
  )
}

function RateRow({ advisor, pending, run }: { advisor: AdvisorSummary; pending: boolean; run: Runner }) {
  const [rate, setRate] = useState(advisor.rate === null ? "" : String(advisor.rate))
  const [reason, setReason] = useState("")
  const id = `rate-${advisor.id}`
  return (
    <form
      className="flex flex-wrap items-end gap-2 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => setAdvisorCommissionRate(advisor.id, rate.trim() === "" ? null : Number(rate), reason), `Rate updated for ${advisor.name}.`)
        setReason("")
      }}
    >
      <span className="min-w-36 flex-1 text-sm font-medium">{advisor.name}</span>
      <label htmlFor={id} className="flex flex-col gap-1 text-xs text-muted-foreground">
        Rate %
        <Input id={id} className="h-8 w-20" type="number" min="0" max="100" step="0.1" placeholder="Product" value={rate} onChange={(e) => setRate(e.target.value)} />
      </label>
      <label htmlFor={`${id}-why`} className="flex flex-col gap-1 text-xs text-muted-foreground">
        Reason
        <Input id={`${id}-why`} className="h-8 w-48" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the change" />
      </label>
      <Button size="sm" variant="ghost" type="submit" disabled={pending}>
        Save
      </Button>
    </form>
  )
}

/* -------- Line payout cell -------- */

export function PayoutCell({ row, pending, run }: { row: LedgerRow; pending: boolean; run: Runner }) {
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
          run(() => reverseCommissionPayout(row.payout!.id, reason), "Payout reversed.")
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
          run(() => recordCommissionPayout(row.id, { method: "salary", reference: ref, note: "" }), "Payout recorded.")
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
