"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Check, ShoppingCart, Sparkles, Trash2, UserCog, Wrench } from "lucide-react"
import { formatCurrency as money } from "@/lib/utils"
import { Card, GhostButton, PrimaryButton } from "@/components/ui"
import {
  removeStaffTarget,
  saveStaffTarget,
  saveStaffTargets,
  suggestStaffTargets,
  type SuggestionMap,
  type TargetKind,
  type TargetSuggestion,
} from "@/lib/actions-targets"

export type TargetRow = {
  userId: string
  name: string
  title: string
  total: number
  count: number
  target: number
}

type Staff = { id: string; name: string }

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function shortMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" })
}

export function StaffTargetsClient({
  month,
  purchasers,
  advisors,
  technicians,
  staff,
}: {
  month: string
  purchasers: TargetRow[]
  advisors: TargetRow[]
  technicians: TargetRow[]
  staff: Staff[]
}) {
  const router = useRouter()
  const go = (m: string) => router.push(`/reports/staff-targets?month=${m}`)
  const [suggestions, setSuggestions] = useState<{ month: string; map: SuggestionMap; ai: boolean } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const current = suggestions?.month === month ? suggestions : null

  function loadSuggestions() {
    setAiError(null)
    startLoading(async () => {
      const res = await suggestStaffTargets(month)
      if (!res.ok) return setAiError(res.error)
      setSuggestions({ month, map: res.suggestions, ai: res.ai })
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Targets</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Set, change or remove monthly targets for every staff member, and use AI suggestions as a reference.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <GhostButton onClick={() => go(shiftMonth(month, -1))} aria-label="Previous month">
            Prev
          </GhostButton>
          <div>
            <label htmlFor="st-month" className="mb-1 block text-xs text-muted-foreground">
              Month
            </label>
            <input
              id="st-month"
              type="month"
              value={month}
              onChange={(e) => e.target.value && go(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <GhostButton onClick={() => go(shiftMonth(month, 1))} aria-label="Next month">
            Next
          </GhostButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/reports"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Financial
        </Link>
        <Link
          href="/reports/top-customers"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Top Customers
        </Link>
        <span className="rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-foreground">
          Staff Targets
        </span>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">AI target reference</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              {current
                ? current.ai
                  ? `Suggestions for ${monthLabel(month)} based on each person's last 6 months. Nothing is saved until you click Use or Apply.`
                  : `AI was unavailable, so these suggestions use each person's 6-month average plus 10%. Nothing is saved until you click Use or Apply.`
                : `Get a suggested target for each person from their last 6 months of work. You decide whether to use it.`}
            </p>
            {aiError && <p className="mt-1 text-xs text-destructive">{aiError}</p>}
          </div>
        </div>
        <PrimaryButton onClick={loadSuggestions} disabled={loading}>
          {loading ? "Analysing…" : current ? "Refresh suggestions" : "Get AI suggestions"}
        </PrimaryButton>
      </Card>

      <TargetSection
        kind="purchase"
        title="Purchasers"
        subtitle={`Confirmed supplier invoices captured in ${monthLabel(month)}`}
        countLabel="Invoices"
        icon={<ShoppingCart className="size-5" aria-hidden />}
        rows={purchasers}
        staff={staff}
        suggestions={current?.map.purchase}
      />
      <TargetSection
        kind="sales"
        title="Service Advisors"
        subtitle={`Customer invoices (excluding cancelled) on their job cards in ${monthLabel(month)}`}
        countLabel="Invoices"
        icon={<UserCog className="size-5" aria-hidden />}
        rows={advisors}
        staff={staff}
        suggestions={current?.map.sales}
      />
      <TargetSection
        kind="technician"
        title="Technicians"
        subtitle={`Customer invoices (excluding cancelled) for jobs they worked on in ${monthLabel(month)}`}
        countLabel="Jobs"
        icon={<Wrench className="size-5" aria-hidden />}
        rows={technicians}
        staff={staff}
        suggestions={current?.map.technician}
      />
    </div>
  )
}

function TargetSection({
  kind,
  title,
  subtitle,
  countLabel,
  icon,
  rows,
  staff,
  suggestions,
}: {
  kind: TargetKind
  title: string
  subtitle: string
  countLabel: string
  icon: React.ReactNode
  rows: TargetRow[]
  staff: Staff[]
  suggestions?: Record<string, TargetSuggestion>
}) {
  const router = useRouter()
  const [adding, setAdding] = useState("")
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applying, startApply] = useTransition()

  const staffById = new Map(staff.map((s) => [s.id, s]))
  const listed = new Set(rows.map((r) => r.userId))
  const extraIds = [
    ...Object.keys(suggestions ?? {}).filter((id) => !listed.has(id) && staffById.has(id)),
    ...(adding && !listed.has(adding) ? [adding] : []),
  ]
  const all: TargetRow[] = [
    ...rows,
    ...[...new Set(extraIds)].map((id) => ({
      userId: id,
      name: staffById.get(id)?.name ?? "Unnamed",
      title: "",
      total: 0,
      count: 0,
      target: 0,
    })),
  ]
  const shown = new Set(all.map((r) => r.userId))
  const available = staff.filter((s) => !shown.has(s.id))
  const totalSum = rows.reduce((t, r) => t + r.total, 0)
  const targetSum = rows.reduce((t, r) => t + r.target, 0)

  const toApply = all.filter((r) => suggestions?.[r.userId] && suggestions[r.userId].target !== r.target)

  function applyAll() {
    if (!suggestions || toApply.length === 0) return
    if (!confirm(`Set ${toApply.length} ${title.toLowerCase()} target(s) to the AI suggestion?`)) return
    setApplyError(null)
    startApply(async () => {
      const res = await saveStaffTargets(
        toApply.map((r) => ({ userId: r.userId, kind, amount: suggestions[r.userId].target })),
      )
      if (!res.ok) return setApplyError(res.error)
      router.refresh()
    })
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-accent text-primary">{icon}</span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {suggestions && toApply.length > 0 && (
            <GhostButton onClick={applyAll} disabled={applying}>
              <Sparkles className="size-4" aria-hidden />
              {applying ? "Applying…" : `Apply AI targets (${toApply.length})`}
            </GhostButton>
          )}
          <div className="text-right text-sm">
            <div className="font-semibold">{money(totalSum)}</div>
            <div className="text-xs text-muted-foreground">of {money(targetSum)} target</div>
          </div>
        </div>
      </div>
      {applyError && <p className="border-b border-border px-4 py-2 text-xs text-destructive">{applyError}</p>}

      {all.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No activity this month. Add a person below to set a target.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 text-right font-medium">{countLabel}</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Monthly target</th>
                {suggestions && <th className="min-w-56 px-4 py-2 font-medium">AI reference</th>}
                <th className="min-w-44 px-4 py-2 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <Row
                  key={`${r.userId}-${r.target}`}
                  row={r}
                  kind={kind}
                  showSuggestion={!!suggestions}
                  suggestion={suggestions?.[r.userId]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          <label htmlFor={`add-${kind}`} className="text-xs text-muted-foreground">
            Set a target for someone else
          </label>
          <select
            id={`add-${kind}`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Choose staff…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Card>
  )
}

function Row({
  row,
  kind,
  showSuggestion,
  suggestion,
}: {
  row: TargetRow
  kind: TargetKind
  showSuggestion: boolean
  suggestion?: TargetSuggestion
}) {
  const router = useRouter()
  const [value, setValue] = useState(row.target ? String(row.target) : "")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = Number(value || 0) !== row.target
  const pct = row.target > 0 ? Math.round((row.total / row.target) * 100) : null
  const achieved = pct !== null && pct >= 100

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

  const save = () => run(() => saveStaffTarget(row.userId, kind, Number(value || 0)))

  function remove() {
    if (!confirm(`Remove the target for ${row.name}?`)) return
    setValue("")
    run(() => removeStaffTarget(row.userId, kind))
  }

  const peak = suggestion ? Math.max(1, ...suggestion.history.map((h) => h.total)) : 1

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{row.name}</div>
        {row.title && <div className="text-xs capitalize text-muted-foreground">{row.title}</div>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(row.total)}</td>
      <td className="px-4 py-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label htmlFor={`t-${kind}-${row.userId}`} className="sr-only">
            Monthly target for {row.name}
          </label>
          <input
            id={`t-${kind}-${row.userId}`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-32 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
          />
          {dirty ? (
            <PrimaryButton type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </PrimaryButton>
          ) : saved ? (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="size-4" aria-hidden /> Saved
            </span>
          ) : row.target > 0 ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label={`Remove target for ${row.name}`}
              title="Remove target"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </form>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      {showSuggestion && (
        <td className="px-4 py-3">
          {suggestion ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{money(suggestion.target)}</span>
                {Number(value || 0) !== suggestion.target && (
                  <button
                    type="button"
                    onClick={() => setValue(String(suggestion.target))}
                    className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-primary hover:bg-accent"
                  >
                    Use
                  </button>
                )}
              </div>
              <div className="flex h-6 items-end gap-0.5" aria-hidden>
                {suggestion.history.map((h) => (
                  <div
                    key={h.month}
                    title={`${shortMonth(h.month)}: ${money(h.total)}`}
                    className="w-3 rounded-sm bg-primary/50"
                    style={{ height: `${Math.max(8, (h.total / peak) * 100)}%` }}
                  />
                ))}
              </div>
              <p className="sr-only">
                Last 6 months: {suggestion.history.map((h) => `${shortMonth(h.month)} ${money(h.total)}`).join(", ")}
              </p>
              <p className="max-w-64 text-xs leading-relaxed text-muted-foreground text-pretty">{suggestion.reason}</p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No history in the last 6 months</span>
          )}
        </td>
      )}
      <td className="px-4 py-3">
        {pct === null ? (
          <span className="text-xs text-muted-foreground">No target set</span>
        ) : (
          <div className="flex flex-col gap-1">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.min(pct, 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.name} target progress`}
            >
              <div
                className={achieved ? "h-full bg-primary" : "h-full bg-primary/60"}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className={achieved ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>
              {achieved ? `Target achieved · ${pct}%` : `${pct}% · ${money(row.target - row.total)} to go`}
            </span>
          </div>
        )}
      </td>
    </tr>
  )
}
