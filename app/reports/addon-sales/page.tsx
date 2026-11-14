import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { requirePageAccess } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AddonLedgerClient } from "@/components/addon-ledger-client"
import { loadLedger, openAddonJobIds, syncAddonSales } from "@/lib/addon-sales-data"
import { monthRange } from "@/lib/addon-month"

export const metadata = { title: "Add-on Sales · SHWURX Auto Service Center" }

export default async function AddonSalesReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requirePageAccess(["reports.financial", "payroll.manage"], "Add-on Sales")
  const user = await getShellUser()
  const { month, from, to } = monthRange((await searchParams).month)

  await syncAddonSales(await openAddonJobIds())
  const svc = createServiceClient()
  const [rows, { data: staff }, { data: targets }] = await Promise.all([
    loadLedger({ from, to }),
    svc.from("profiles").select("id, full_name").eq("role", "service_advisor").eq("is_active", true).order("full_name"),
    svc.from("staff_targets").select("user_id, monthly_target").eq("kind", "addon"),
  ])
  const targetBy = new Map((targets ?? []).map((t) => [t.user_id, Number(t.monthly_target) || 0]))
  const advisors = new Map((staff ?? []).map((p) => [p.id, p.full_name ?? "Advisor"]))
  for (const r of rows) if (r.advisor_id && !advisors.has(r.advisor_id)) advisors.set(r.advisor_id, r.advisor_name ?? "Advisor")

  return (
    <AppShell user={user}>
      <AddonLedgerClient
        rows={rows}
        month={month}
        advisors={[...advisors].map(([id, name]) => ({ id, name, target: targetBy.get(id) ?? 0 }))}
        canPay={ctx.permissions.has("payroll.manage")}
        canSetTargets={ctx.permissions.has("settings.manage")}
        canSeeCost={ctx.permissions.has("costs.view") || ctx.permissions.has("reports.financial")}
        selfView={false}
      />
    </AppShell>
  )
}
