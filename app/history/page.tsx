import Link from "next/link"
import { Car, ReceiptText, Search, Users, X } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { cn } from "@/lib/utils"
import {
  isStatus,
  loadHistory,
  searchHistory,
  summarizeCustomers,
  summarizeVehicles,
  type HistoryStatus,
} from "@/lib/history-data"
import { HistoryInvoices } from "@/components/history/history-invoices"
import { HistoryCustomers, HistoryVehicles } from "@/components/history/history-groups"
import { STATUS_LABEL, aed } from "@/components/history/history-shared"

export const dynamic = "force-dynamic"

type View = "invoices" | "customers" | "vehicles"
const VIEWS: { key: View; label: string; icon: typeof ReceiptText }[] = [
  { key: "invoices", label: "Invoices", icon: ReceiptText },
  { key: "customers", label: "Customers", icon: Users },
  { key: "vehicles", label: "Cars", icon: Car },
]

function buildHref(params: { view: View; q: string; status: HistoryStatus | null }) {
  const sp = new URLSearchParams()
  if (params.view !== "invoices") sp.set("view", params.view)
  if (params.q) sp.set("q", params.q)
  if (params.status) sp.set("status", params.status)
  const s = sp.toString()
  return s ? `/history?${s}` : "/history"
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; status?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q ?? "").slice(0, 100).trim()
  const view: View = sp.view === "customers" || sp.view === "vehicles" ? sp.view : "invoices"
  const status = isStatus(sp.status) ? sp.status : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [{ data: profile }, all] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user!.id).maybeSingle(),
    loadHistory(),
  ])

  const matched = searchHistory(all, q)
  const counts = matched.reduce<Record<HistoryStatus, number>>(
    (acc, r) => ((acc[r.status] += 1), acc),
    { paid: 0, partial: 0, unpaid: 0, cancelled: 0 },
  )
  const rows = status ? matched.filter((r) => r.status === status) : matched
  const live = rows.filter((r) => r.status !== "cancelled")
  const invoiced = live.reduce((s, r) => s + r.total, 0)
  const collected = live.reduce((s, r) => s + r.paid, 0)
  const outstanding = live.reduce((s, r) => s + r.balance, 0)

  const customers = view === "customers" ? summarizeCustomers(rows) : []
  const vehicles = view === "vehicles" ? summarizeVehicles(rows) : []
  const resultCount = view === "customers" ? customers.length : view === "vehicles" ? vehicles.length : rows.length

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-pretty text-sm text-muted-foreground">
            Every invoice ever issued stays here permanently, including cancelled ones and archived job cards.
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          {[
            { label: "Invoices", value: String(rows.length), tone: "" },
            { label: "Invoiced", value: aed(invoiced), tone: "" },
            { label: "Collected", value: aed(collected), tone: "text-emerald-400" },
            { label: "Outstanding", value: aed(outstanding), tone: outstanding > 0 ? "text-amber-400" : "" },
          ].map((s) => (
            <div key={s.label} className="bg-card px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
              <dd className={cn("mt-0.5 truncate text-lg font-bold tabular-nums", s.tone)}>{s.value}</dd>
            </div>
          ))}
        </dl>

        <form action="/history" method="get" role="search" className="flex gap-2">
          {view !== "invoices" ? <input type="hidden" name="view" value={view} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="history-q" className="sr-only">
              Search history
            </label>
            <input
              id="history-q"
              name="q"
              type="search"
              defaultValue={q}
              autoComplete="off"
              placeholder="Search invoice, job card, customer, mobile, plate, VIN or car…"
              className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {q ? (
              <Link
                href={buildHref({ view, q: "", status })}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Search
          </button>
        </form>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <nav aria-label="History view" className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {VIEWS.map((v) => {
              const active = v.key === view
              return (
                <Link
                  key={v.key}
                  href={buildHref({ view: v.key, q, status })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:flex-none",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <v.icon className="h-4 w-4" aria-hidden="true" />
                  {v.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex flex-wrap gap-1.5" aria-label="Filter by status">
            {([null, "paid", "partial", "unpaid", "cancelled"] as (HistoryStatus | null)[]).map((s) => {
              const active = s === status
              const count = s ? counts[s] : matched.length
              return (
                <Link
                  key={s ?? "all"}
                  href={buildHref({ view, q, status: s })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s ? STATUS_LABEL[s] : "All"} <span className="tabular-nums opacity-70">{count}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {resultCount} {view === "customers" ? "customer" : view === "vehicles" ? "car" : "invoice"}
          {resultCount === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
        </p>

        {resultCount === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Search className="mb-3 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">{q || status ? "Nothing matches this search" : "No invoices yet"}</p>
            <p className="text-xs text-muted-foreground">
              {q || status ? "Try a plate number, mobile or invoice number." : "Invoices appear here once issued."}
            </p>
          </div>
        ) : view === "customers" ? (
          <HistoryCustomers rows={customers} />
        ) : view === "vehicles" ? (
          <HistoryVehicles rows={vehicles} />
        ) : (
          <HistoryInvoices rows={rows} />
        )}
      </div>
    </AppShell>
  )
}
