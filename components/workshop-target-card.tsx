"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Building2, Check, Trash2 } from "lucide-react"
import { formatCurrency as money } from "@/lib/utils"
import { Card, PrimaryButton } from "@/components/ui"
import { removeWorkshopTarget, saveWorkshopTarget } from "@/lib/actions-targets"

export type WorkshopTargetData = {
  target: { amount: number; fromMonth: string } | null
  revenue: number
  invoices: number
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function daysInfo(month: string) {
  const [y, m] = month.split("-").map(Number)
  const total = new Date(y, m, 0).getDate()
  const now = new Date()
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m
  const isPast = new Date(y, m, 1) <= now
  const elapsed = isCurrent ? now.getDate() : isPast ? total : 0
  return { total, elapsed, remaining: total - elapsed, isCurrent }
}

export function WorkshopTargetCard({
  month,
  data,
  staffSalesTargets,
}: {
  month: string
  data: WorkshopTargetData
  staffSalesTargets: number
}) {
  const router = useRouter()
  const ownMonth = data.target?.fromMonth === month
  const target = data.target?.amount ?? 0
  const [value, setValue] = useState(target ? String(target) : "")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = Number(value || 0) !== target || (!ownMonth && Number(value || 0) > 0)
  const pct = target > 0 ? Math.round((data.revenue / target) * 100) : null
  const achieved = pct !== null && pct >= 100
  const days = daysInfo(month)
  const expectedPct = days.total ? Math.round((days.elapsed / days.total) * 100) : 0
  const dailyNeeded = target > data.revenue && days.remaining > 0 ? (target - data.revenue) / days.remaining : 0
  const gap = staffSalesTargets - target

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) return setError(res.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm(`Remove the workshop target for ${monthLabel(month)}?`)) return
    setValue("")
    run(() => removeWorkshopTarget(month))
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">Workshop total target</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              All customer invoices (excluding cancelled) in {monthLabel(month)}.
              {data.target && !ownMonth && ` Carried over from ${monthLabel(data.target.fromMonth)} — save to set this month.`}
            </p>
          </div>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => saveWorkshopTarget(month, Number(value || 0)))
          }}
        >
          <label htmlFor="workshop-target" className="text-xs text-muted-foreground">
            Monthly target (AED)
          </label>
          <input
            id="workshop-target"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-36 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums"
          />
          {dirty ? (
            <PrimaryButton type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </PrimaryButton>
          ) : saved ? (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="size-4" aria-hidden /> Saved
            </span>
          ) : ownMonth ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="Remove workshop target"
              title="Remove target"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </form>
      </div>
      {error && <p className="-mt-3 text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold tabular-nums">{money(data.revenue)}</div>
          <div className="text-sm text-muted-foreground">
            {target > 0 ? `of ${money(target)} target` : "No workshop target set"} · {data.invoices} invoice
            {data.invoices === 1 ? "" : "s"}
          </div>
        </div>
        {pct !== null && (
          <div className={achieved ? "text-2xl font-bold text-primary" : "text-2xl font-bold"}>{pct}%</div>
        )}
      </div>

      {pct !== null && (
        <div className="flex flex-col gap-2">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.min(pct, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Workshop target progress"
          >
            <div
              className={achieved ? "h-full bg-primary" : "h-full bg-primary/70"}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
            {days.isCurrent && (
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/70"
                style={{ left: `${expectedPct}%` }}
                title={`Expected by today: ${expectedPct}%`}
                aria-hidden
              />
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {achieved
                ? "Workshop target achieved"
                : `${money(target - data.revenue)} to go`}
              {days.isCurrent && ` · on pace needs ${expectedPct}% by today`}
            </span>
            {dailyNeeded > 0 && days.remaining > 0 && (
              <span>
                {money(dailyNeeded)} per day for the remaining {days.remaining} day{days.remaining === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      )}

      {target > 0 && staffSalesTargets > 0 && (
        <p className="rounded-md bg-accent px-3 py-2 text-xs text-muted-foreground text-pretty">
          Service advisor targets add up to {money(staffSalesTargets)}
          {gap === 0
            ? ", matching the workshop target."
            : gap > 0
              ? `, ${money(gap)} above the workshop target.`
              : `, ${money(-gap)} short of the workshop target — raise individual targets to cover it.`}
        </p>
      )}
    </Card>
  )
}
