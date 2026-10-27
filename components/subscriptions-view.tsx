"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, ExternalLink, Plus, Upload, X } from "lucide-react"
import { Button, Card, Input, Select } from "@/components/ui"
import { SubscriptionForm, EMPTY_SUBSCRIPTION, type StaffOption } from "@/components/subscription-form"
import { CATEGORY_LABEL, CRIT_TONE, CYCLE_LABEL, DUE_LABEL, DUE_TONE, money } from "@/components/subscription-labels"
import { importSubscriptions, openBillingPortal } from "@/lib/actions-subscriptions"
import {
  CSV_COLUMNS,
  SUBSCRIPTION_CATEGORIES,
  cashRequirementAED,
  daysBetween,
  dubaiToday,
  dueState,
  monthlyCostAED,
  parseCsv,
  yearlyCostAED,
  type BillingCycle,
  type Criticality,
  type DueState,
  type SubscriptionCategory,
  type SubscriptionLike,
  type SubscriptionStatus,
} from "@/lib/subscriptions"

export interface SubscriptionRow extends SubscriptionLike {
  id: string
  service_name: string
  category: SubscriptionCategory
  vendor: string
  renewal_type: string
  owner: string
  portalReady: boolean
  pendingPayment: boolean
  billing_cycle: BillingCycle
  criticality: Criticality
  status: SubscriptionStatus
}

type Filter = "attention" | "all" | "pending_verification" | "inactive"

export function SubscriptionsView({
  rows,
  staff,
  canManage,
  canApprove,
}: {
  rows: SubscriptionRow[]
  staff: StaffOption[]
  canManage: boolean
  canApprove: boolean
}) {
  const today = dubaiToday()
  const [panel, setPanel] = React.useState<"none" | "add" | "import">("none")
  const [filter, setFilter] = React.useState<Filter>("attention")
  const [category, setCategory] = React.useState<string>("")
  const [q, setQ] = React.useState("")

  const withState = rows.map((r) => ({ ...r, due: dueState(r, today) as DueState }))
  const tracked = withState.filter((r) => r.due !== "inactive")
  const overdue = tracked.filter((r) => r.due === "overdue")
  const next7 = tracked.filter((r) => r.due === "due_today" || (r.due === "due_soon" && daysBetween(today, r.next_due_date) <= 7))
  const monthly = tracked.reduce((s, r) => s + monthlyCostAED(r), 0)
  const yearly = tracked.reduce((s, r) => s + yearlyCostAED(r), 0)
  const cash30 = cashRequirementAED(tracked, today, 30)
  const pendingVerify = withState.filter((r) => r.status === "pending_verification").length

  const visible = withState.filter((r) => {
    if (category && r.category !== category) return false
    if (q && !`${r.service_name} ${r.vendor} ${r.owner}`.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === "attention") return ["overdue", "due_today", "due_soon"].includes(r.due) || r.pendingPayment || r.status === "pending_verification"
    if (filter === "pending_verification") return r.status === "pending_verification"
    if (filter === "inactive") return r.due === "inactive"
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/finance" className="text-xs text-muted-foreground hover:text-foreground">
            Finance
          </Link>
          <h1 className="text-balance text-2xl font-semibold text-foreground">Subscriptions & Renewals</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Every service the business pays for, who owns it, and when it renews. A renewal only counts as paid once an approver confirms the receipt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance/continuity"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent"
          >
            Critical services
          </Link>
          {canManage ? (
            <>
              <Button variant="outline" onClick={() => setPanel(panel === "import" ? "none" : "import")}>
                <Upload className="size-4" aria-hidden />
                Import CSV
              </Button>
              <Button onClick={() => setPanel(panel === "add" ? "none" : "add")}>
                <Plus className="size-4" aria-hidden />
                Add subscription
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <section aria-label="Renewal summary" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Overdue" value={String(overdue.length)} alert={overdue.length > 0} sub={overdue.length ? overdue.map((o) => o.service_name).slice(0, 2).join(", ") : "Nothing overdue"} />
        <Kpi label="Due in 7 days" value={String(next7.length)} sub={next7.length ? money(next7.reduce((s, r) => s + yearlyCostAED(r) / (r.billing_cycle === "yearly" ? 1 : 12), 0)) : "None"} />
        <Kpi label="Cash needed, 30 days" value={money(cash30)} />
        <Kpi label="Monthly run rate" value={money(monthly)} />
        <Kpi label="Yearly cost" value={money(yearly)} sub={`${tracked.length} active services`} />
      </section>

      {panel === "add" ? (
        <Card className="flex flex-col gap-4 p-5">
          <PanelHeader title="Add subscription" onClose={() => setPanel("none")} />
          <SubscriptionForm initial={EMPTY_SUBSCRIPTION} staff={staff} canApprove={canApprove} onDone={() => setPanel("none")} />
        </Card>
      ) : null}
      {panel === "import" ? <ImportPanel onClose={() => setPanel("none")} /> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-1 self-start rounded-lg border border-border bg-card/50 p-1">
          {(
            [
              ["attention", "Needs attention"],
              ["all", "All"],
              ["pending_verification", `To verify${pendingVerify ? ` (${pendingVerify})` : ""}`],
              ["inactive", "Paused & cancelled"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="sub-search">
            Search
          </label>
          <Input id="sub-search" placeholder="Search service, vendor, owner" value={q} onChange={(e) => setQ(e.target.value)} className="md:w-64" />
          <label className="sr-only" htmlFor="sub-cat">
            Category
          </label>
          <Select id="sub-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="md:w-44">
            <option value="">All categories</option>
            {SUBSCRIPTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No subscriptions yet. Add one or import your list from a CSV." : "Nothing matches this view."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r) => (
              <SubscriptionItem key={r.id} r={r} today={today} canPay={canManage || canApprove} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SubscriptionItem({ r, today, canPay }: { r: SubscriptionRow & { due: DueState }; today: string; canPay: boolean }) {
  const [err, setErr] = React.useState<string | null>(null)
  const days = daysBetween(today, r.next_due_date)
  const when = r.due === "overdue" ? `${-days} day${days === -1 ? "" : "s"} overdue` : r.due === "due_today" ? "Due today" : `in ${days} days`

  async function pay() {
    setErr(null)
    const res = await openBillingPortal(r.id)
    if (!res.ok) return setErr(res.error)
    window.open(res.url, "_blank", "noopener,noreferrer")
  }

  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/finance/subscriptions/${r.id}`} className="truncate font-medium text-foreground hover:underline">
            {r.service_name}
          </Link>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${DUE_TONE[r.due]}`}>{DUE_LABEL[r.due]}</span>
          {r.status === "pending_verification" ? <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">Needs verification</span> : null}
          {r.pendingPayment ? <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">Payment awaiting confirmation</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {CATEGORY_LABEL[r.category]} · {r.vendor || "No vendor"} · <span className={CRIT_TONE[r.criticality]}>{r.criticality}</span> · {r.owner || "No owner"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 md:justify-end">
        <div className="flex flex-col items-start md:items-end">
          <span className="font-mono text-sm tabular-nums text-foreground">{money(r.amount, r.currency)}</span>
          <span className="text-xs text-muted-foreground">
            {CYCLE_LABEL[r.billing_cycle]} · {r.next_due_date} {r.due !== "inactive" && r.due !== "resolved" ? `(${when})` : ""}
          </span>
        </div>
        {canPay && r.due !== "inactive" ? (
          <Button size="sm" variant="outline" onClick={pay} disabled={!r.portalReady} title={r.portalReady ? "Opens the verified billing portal" : "No verified billing portal yet"}>
            <ExternalLink className="size-3.5" aria-hidden />
            Pay now
          </Button>
        ) : null}
      </div>
      {err ? (
        <p role="alert" className="text-xs text-red-300 md:basis-full">
          {err}
        </p>
      ) : null}
    </li>
  )
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <Card className={`flex flex-col gap-1 p-4 ${alert ? "border-red-500/50" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-lg tabular-nums ${alert ? "text-red-300" : "text-foreground"}`}>{value}</span>
      {sub ? <span className="truncate text-xs text-muted-foreground">{sub}</span> : null}
    </Card>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<Record<string, string>[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ imported: number; rejected: { line: number; errors: string[] }[] } | null>(null)
  const [pending, start] = React.useTransition()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setResult(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) return setError("The CSV must be under 1 MB.")
    const table = parseCsv(await file.text()).filter((r) => r.some((c) => c.trim()))
    if (table.length < 2) return setError("The file has no data rows.")
    const header = table[0].map((h) => h.trim().toLowerCase())
    if (!header.includes("service_name") || !header.includes("next_due_date")) return setError("The header row must include service_name and next_due_date.")
    setRows(table.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))))
  }

  function template() {
    const sample = ["Vercel Pro", "hosting", "Vercel", "shwurx team", "https://swurxauto.com", "https://vercel.com/account/billing", "monthly", "", "20", "USD", "3.6725", "0", "false", "2026-11-15", "auto", "true", "Visa ending 4421", "IT", "critical", ""]
    const csv = `${CSV_COLUMNS.join(",")}\n${sample.join(",")}\n`
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "subscriptions-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  function submit() {
    start(async () => {
      const res = await importSubscriptions(rows)
      if (!res.ok) return setError(res.error)
      setResult({ imported: res.imported, rejected: res.rejected })
      setRows([])
      router.refresh()
    })
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="Import from CSV" onClose={onClose} />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Imported rows are saved as <span className="text-foreground">Needs verification</span> until an approver checks each one against the provider. Never include card numbers or passwords.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent">
          <Upload className="size-4" aria-hidden />
          Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
        </label>
        <Button variant="ghost" onClick={template}>
          <Download className="size-4" aria-hidden />
          Download template
        </Button>
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">{rows.length} rows ready. Preview:</p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {rows.slice(0, 5).map((r, i) => (
              <li key={i}>
                {r.service_name || "(no name)"} · {r.amount} {r.currency || "AED"} · due {r.next_due_date}
              </li>
            ))}
            {rows.length > 5 ? <li>and {rows.length - 5} more</li> : null}
          </ul>
          <div>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Importing..." : `Import ${rows.length} rows`}
            </Button>
          </div>
        </div>
      ) : null}
      {result ? (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="text-foreground">Imported {result.imported}. {result.rejected.length ? `${result.rejected.length} rows were rejected:` : "No rows were rejected."}</p>
          <ul className="flex flex-col gap-1 text-xs text-red-300">
            {result.rejected.slice(0, 20).map((r) => (
              <li key={r.line}>
                Line {r.line}: {r.errors.join(" ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
