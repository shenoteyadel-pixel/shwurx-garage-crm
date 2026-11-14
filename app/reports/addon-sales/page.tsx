import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { requirePageAccess } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AddonLedgerClient } from "@/components/addon-ledger-client"
import { loadLedger, openAddonJobIds, syncAddonSales } from "@/lib/addon-sales-data"
import { loadPayoutHistory } from "@/lib/addon-payout-history"
import { dayRange, presetRanges } from "@/lib/addon-month"

export const metadata = { title: "Upsell Commission · SHWURX Auto Service Center" }

export default async function AddonSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>
}) {
  const ctx = await requirePageAccess(["reports.financial", "payroll.manage"], "Upsell Commission")
  const user = await getShellUser()
  const range = dayRange(await searchParams)

  await syncAddonSales(await openAddonJobIds())
  const svc = createServiceClient()
  const [rows, payouts, { data: staff }, { data: targets }, { data: rates }] = await Promise.all([
    loadLedger({ from: range.from, to: range.toExclusive }),
    loadPayoutHistory({ from: range.from, to: range.to }),
    svc.from("profiles").select("id, full_name").eq("role", "service_advisor").eq("is_active", true).order("full_name"),
    svc.from("staff_targets").select("user_id, monthly_target").eq("kind", "addon"),
    svc.from("addon_advisor_rates").select("advisor_id, commission_pct"),
  ])
  const targetBy = new Map((targets ?? []).map((t) => [t.user_id, Number(t.monthly_target) || 0]))
  const rateBy = new Map((rates ?? []).map((r) => [r.advisor_id, Number(r.commission_pct)]))
  const advisors = new Map((staff ?? []).map((p) => [p.id, p.full_name ?? "Advisor"]))
  for (const r of rows) if (r.advisor_id && !advisors.has(r.advisor_id)) advisors.set(r.advisor_id, r.advisor_name ?? "Advisor")

  const canSeeCost = ctx.permissions.has("reports.financial") || ctx.permissions.has("settings.manage")

  return (
    <AppShell user={user}>
      <AddonLedgerClient
        rows={rows}
        payouts={payouts}
        range={{ from: range.from, to: range.to }}
        presets={presetRanges()}
        advisors={[...advisors].map(([id, name]) => ({ id, name, target: targetBy.get(id) ?? 0, rate: rateBy.get(id) ?? null }))}
        canPay={ctx.permissions.has("payroll.manage")}
        canSetTargets={ctx.permissions.has("settings.manage")}
        canSeeCost={canSeeCost}
        selfView={false}
      />
    </AppShell>
  )
}
