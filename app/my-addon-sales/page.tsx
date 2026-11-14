import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { requirePageAccess } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AddonLedgerClient } from "@/components/addon-ledger-client"
import { loadLedger, openAddonJobIds, syncAddonSales } from "@/lib/addon-sales-data"
import { monthRange } from "@/lib/addon-month"

export const metadata = { title: "My Add-on Sales · SHWURX Auto Service Center" }

export default async function MyAddonSalesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requirePageAccess(["quotations.edit"], "My Add-on Sales")
  const user = await getShellUser()
  const { month, from, to } = monthRange((await searchParams).month)

  await syncAddonSales(await openAddonJobIds(ctx.userId))
  const svc = createServiceClient()
  const [rows, { data: target }] = await Promise.all([
    loadLedger({ advisorId: ctx.userId, from, to }),
    svc.from("staff_targets").select("monthly_target").eq("user_id", ctx.userId).eq("kind", "addon").maybeSingle(),
  ])

  return (
    <AppShell user={user}>
      <AddonLedgerClient
        rows={rows}
        month={month}
        advisors={[{ id: ctx.userId, name: user.name ?? "You", target: Number(target?.monthly_target ?? 0) }]}
        canPay={false}
        canSetTargets={false}
        canSeeCost={ctx.permissions.has("costs.view")}
        selfView
      />
    </AppShell>
  )
}
