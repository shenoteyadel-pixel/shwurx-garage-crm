import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { LoyaltyCardVisual, type CardTier } from "@/components/loyalty-card-visual"
import { LoyaltyCardManager } from "@/components/loyalty-card-manager"
import { getShellUser } from "@/lib/shell-user"
import { loyaltyJoinUrl } from "@/lib/loyalty"
import { createServiceClient } from "@/lib/supabase/server"
import { formatCurrency, formatDate } from "@/lib/utils"

export const metadata = { title: "Loyalty Card · SHWURX Auto Service Center" }

const KIND_LABEL: Record<string, string> = {
  earn: "Points earned",
  earn_reversal: "Earned points reversed",
  redeem: "Points redeemed",
  redeem_reversal: "Redemption reversed",
  expire: "Points expired",
  adjust: "Manual adjustment",
}

export default async function LoyaltyCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getShellUser()
  if (user.role !== "owner") redirect("/denied?from=Loyalty%20Cards")

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const svc = createServiceClient()
  const [cardRes, txRes, rulesRes] = await Promise.all([
    svc
      .from("loyalty_memberships")
      .select(
        "id, customer_id, membership_number, enroll_token, status, tier, tier_override, points_balance, points_debt, rolling_spend_aed, lifetime_earned, lifetime_redeemed, lifetime_expired, enroll_failed_attempts, invited_at, enrolled_at, enrolled_via, owner_note, customers(full_name, mobile)",
      )
      .eq("id", id)
      .maybeSingle(),
    svc
      .from("loyalty_transactions")
      .select("id, kind, points, balance_after, reason, created_at, expires_at, invoices(invoice_number)")
      .eq("membership_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    svc
      .from("loyalty_rules")
      .select("points_per_aed_redeemed, silver_threshold_aed, vip_threshold_aed")
      .eq("id", 1)
      .maybeSingle(),
  ])

  const card = cardRes.data as unknown as {
    id: string
    customer_id: string
    membership_number: string
    enroll_token: string
    status: string
    tier: CardTier
    tier_override: CardTier | null
    points_balance: number
    points_debt: number
    rolling_spend_aed: number
    lifetime_earned: number
    lifetime_redeemed: number
    lifetime_expired: number
    enroll_failed_attempts: number
    invited_at: string
    enrolled_at: string | null
    enrolled_via: string | null
    owner_note: string | null
    customers: { full_name: string | null; mobile: string | null } | null
  } | null
  if (!card) notFound()

  const perAed = rulesRes.data?.points_per_aed_redeemed || 100
  const name = card.customers?.full_name ?? "Customer"
  const txs = (txRes.data ?? []) as unknown as {
    id: string
    kind: string
    points: number
    balance_after: number
    reason: string | null
    created_at: string
    expires_at: string | null
    invoices: { invoice_number: string | null } | null
  }[]

  const facts = [
    { label: "Points balance", value: card.points_balance.toLocaleString("en-AE") },
    { label: "Reward value", value: formatCurrency(card.points_balance / perAed) },
    { label: "12-month spend", value: formatCurrency(card.rolling_spend_aed) },
    { label: "Lifetime earned", value: Number(card.lifetime_earned).toLocaleString("en-AE") },
    { label: "Lifetime redeemed", value: Number(card.lifetime_redeemed).toLocaleString("en-AE") },
    { label: "Joined", value: card.enrolled_at ? formatDate(card.enrolled_at) : "Not joined yet" },
  ]

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-6">
        <Link href="/loyalty/cards" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All cards
        </Link>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="flex flex-col gap-4">
            <LoyaltyCardVisual
              tier={card.tier}
              name={name}
              membershipNumber={card.membership_number}
              points={card.points_balance}
              status={card.status}
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight text-balance">{name}</h1>
              <p className="text-sm text-muted-foreground">
                {card.membership_number}
                {card.customers?.mobile ? ` · ${card.customers.mobile}` : ""}
                {" · "}
                <Link href={`/customers/${card.customer_id}`} className="text-primary hover:underline">
                  Customer profile
                </Link>
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="font-semibold tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
            {card.points_debt > 0 ? (
              <p className="rounded-lg border border-border bg-card p-3 text-xs text-destructive">
                {card.points_debt.toLocaleString("en-AE")} points are owed back from a refund and will be taken from future earnings.
              </p>
            ) : null}
          </div>

          <LoyaltyCardManager
            membershipId={card.id}
            status={card.status}
            tier={card.tier}
            tierOverride={card.tier_override}
            note={card.owner_note ?? ""}
            locked={card.enroll_failed_attempts >= 5}
            joinUrl={card.status === "invited" ? loyaltyJoinUrl(card.enroll_token) : null}
            thresholds={{
              silver: Number(rulesRes.data?.silver_threshold_aed ?? 10000),
              vip: Number(rulesRes.data?.vip_threshold_aed ?? 30000),
            }}
          />
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-lg font-semibold">
            Points history
          </h2>
          {txs.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No points activity yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Activity</th>
                    <th className="px-4 py-2 font-medium">Details</th>
                    <th className="px-4 py-2 text-right font-medium">Points</th>
                    <th className="px-4 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(t.created_at)}</td>
                      <td className="px-4 py-2">{KIND_LABEL[t.kind] ?? t.kind}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {t.invoices?.invoice_number ?? t.reason ?? ""}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${t.points < 0 ? "text-destructive" : "text-primary"}`}
                      >
                        {t.points > 0 ? "+" : ""}
                        {t.points.toLocaleString("en-AE")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.balance_after.toLocaleString("en-AE")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
