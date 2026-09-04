import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { SuppliersClient } from "@/components/suppliers-client"

export const metadata = { title: "Suppliers · SHWURX Auto Service Center" }

export default async function SuppliersPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: suppliers } = await supabase.from("suppliers").select("*").order("name")
  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("supplier_id, total, amount_paid, status")

  // Aggregate outstanding balance per supplier: opening + (PO totals − paid).
  const agg = new Map<string, { spend: number; outstanding: number; orders: number }>()
  for (const po of pos ?? []) {
    if (!po.supplier_id || po.status === "cancelled") continue
    const a = agg.get(po.supplier_id) ?? { spend: 0, outstanding: 0, orders: 0 }
    a.spend += Number(po.total) || 0
    a.outstanding += (Number(po.total) || 0) - (Number(po.amount_paid) || 0)
    a.orders += 1
    agg.set(po.supplier_id, a)
  }

  const rows = (suppliers ?? []).map((s) => {
    const a = agg.get(s.id) ?? { spend: 0, outstanding: 0, orders: 0 }
    return {
      ...s,
      total_spend: a.spend,
      outstanding: (Number(s.opening_balance) || 0) + a.outstanding,
      order_count: a.orders,
    }
  })

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <SuppliersClient suppliers={rows} />
      </div>
    </AppShell>
  )
}
