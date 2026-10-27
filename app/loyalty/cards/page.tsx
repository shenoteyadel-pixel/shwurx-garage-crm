import Link from "next/link"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { LoyaltyCardVisual, type CardTier } from "@/components/loyalty-card-visual"
import { AddLoyaltyCard } from "@/components/add-loyalty-card"
import { getShellUser } from "@/lib/shell-user"
import { createServiceClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"

export const metadata = { title: "Loyalty Cards · SHWURX Auto Service Center" }

type Row = {
  id: string
  membership_number: string
  status: string
  tier: CardTier
  tier_override: CardTier | null
  points_balance: number
  rolling_spend_aed: number
  enroll_failed_attempts: number
  customers: { full_name: string | null; mobile: string | null } | null
}

const TIER_FILTERS = [
  { value: "", label: "All tiers" },
  { value: "member", label: "Member" },
  { value: "silver", label: "Silver" },
  { value: "vip", label: "VIP" },
]
const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Not joined yet" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
]

export default async function LoyaltyCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; status?: string }>
}) {
  const user = await getShellUser()
  if (user.role !== "owner") redirect("/denied?from=Loyalty%20Cards")

  const { q = "", tier = "", status = "" } = await searchParams
  const svc = createServiceClient()
  const [cardsRes, rulesRes] = await Promise.all([
    svc
      .from("loyalty_memberships")
      .select(
        "id, membership_number, status, tier, tier_override, points_balance, rolling_spend_aed, enroll_failed_attempts, customers(full_name, mobile)",
      )
      .order("updated_at", { ascending: false })
      .limit(1000),
    svc.from("loyalty_rules").select("program_enabled, points_per_aed_redeemed").eq("id", 1).maybeSingle(),
  ])

  const all = (cardsRes.data ?? []) as unknown as Row[]
  const needle = q.trim().toLowerCase()
  const cards = all.filter((c) => {
    if (tier && c.tier !== tier) return false
    if (status && c.status !== status) return false
    if (!needle) return true
    return [c.customers?.full_name, c.customers?.mobile, c.membership_number]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const perAed = rulesRes.data?.points_per_aed_redeemed || 100
  const active = all.filter((c) => c.status === "active")
  const totalPoints = active.reduce((s, c) => s + (c.points_balance || 0), 0)
  const stats = [
    { label: "Cards", value: all.length.toLocaleString("en-AE") },
    { label: "Active members", value: active.length.toLocaleString("en-AE") },
    { label: "Not joined yet", value: all.filter((c) => c.status === "invited").length.toLocaleString("en-AE") },
    { label: "Points owed (value)", value: formatCurrency(totalPoints / perAed) },
  ]

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Loyalty Cards</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Every customer loyalty card. Open a card to change its tier, status or points.
              {rulesRes.data && !rulesRes.data.program_enabled ? " The program is currently switched off." : ""}
            </p>
          </div>
          <AddLoyaltyCard />
        </header>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        <form className="flex flex-col gap-2 sm:flex-row" action="/loyalty/cards">
          <label htmlFor="card-search" className="sr-only">
            Search cards
          </label>
          <input
            id="card-search"
            name="q"
            defaultValue={q}
            placeholder="Search name, mobile or card number"
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <label htmlFor="card-tier" className="sr-only">
            Tier
          </label>
          <select id="card-tier" name="tier" defaultValue={tier} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            {TIER_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label htmlFor="card-status" className="sr-only">
            Status
          </label>
          <select id="card-status" name="status" defaultValue={status} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Filter
          </button>
        </form>

        {cardsRes.error ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">
            Could not load loyalty cards. Please refresh the page.
          </p>
        ) : cards.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {all.length === 0
              ? "No cards yet. A card is created the first time a customer's invoice is printed, or add one with \u201cAdd card\u201d."
              : "No cards match this filter."}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/loyalty/cards/${c.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LoyaltyCardVisual
                    size="sm"
                    tier={c.tier}
                    name={c.customers?.full_name ?? "Customer"}
                    membershipNumber={c.membership_number}
                    points={c.points_balance}
                    status={c.status}
                  />
                  <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                    <span>12-month spend {formatCurrency(c.rolling_spend_aed)}</span>
                    <span className="flex gap-1">
                      {c.tier_override ? <span className="rounded bg-accent px-1.5 py-0.5 text-foreground">Tier set by owner</span> : null}
                      {c.enroll_failed_attempts >= 5 ? (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">Locked</span>
                      ) : null}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
