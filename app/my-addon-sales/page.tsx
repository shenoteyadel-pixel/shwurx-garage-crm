import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { requirePageAccess } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AddonLedgerClient } from "@/components/addon-ledger-client"
import { loadLedger, openAddonJobIds, syncAddonSales } from "@/lib/addon-sales-data"
import { loadPayoutHistory } from "@/lib/addon-payout-history"
import { dayRange, presetRanges } from "@/lib/addon-month"

export const metadata = { title: "My Upsell Commission · SHWURX Auto Service Center" }

export default async function MyAddonSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>
}) {
  const ctx = await requirePageAccess(["quotations.edit"], "My Upsell Commission")
  const user = await getShellUser()
  const range = dayRange(await searchParams)

  await syncAddonSales(await openAddonJobIds(ctx.userId))
  const svc = createServiceClient()
  const [rows, payouts, { data: target }, { data: rate }] = await Promise.all([
    loadLedger({ advisorId: ctx.userId, from: range.from, to: range.toExclusive }),
    loadPayoutHistory({ from: range.from, to: range.to, advisorId: ctx.userId }),
    svc.from("staff_targets").select("monthly_target").eq("user_id", ctx.userId).eq("kind", "addon").maybeSingle(),
    svc.from("addon_advisor_rates").select("commission_pct").eq("advisor_id", ctx.userId).maybeSingle(),
  ])

  return (
    <AppShell user={user}>
      <AddonLedgerClient
        rows={rows}
        payouts={payouts}
        range={{ from: range.from, to: range.to }}
        presets={presetRanges()}
        advisors={[
          {
            id: ctx.userId,
            name: user.name ?? "You",
            target: Number(target?.monthly_target ?? 0),
            rate: rate ? Number(rate.commission_pct) : null,
          },
        ]}
        canPay={false}
        canSetTargets={false}
        canSeeCost={false}
        selfView
      />
    </AppShell>
  )
}
