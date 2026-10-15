import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { InventoryClient } from "@/components/inventory-client"
import { canViewCosts, canViewSuppliers, stripSensitiveFields } from "@/lib/rbac/visibility"
import { STUCK_STOCK_DAYS } from "@/lib/stock-usage"

export const metadata = { title: "Store & Inventory · SHWURX Auto Service Center" }

export default async function InventoryPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const [{ data: items }, { data: suppliers }, { data: movements }, { data: jobs }, { data: outs }] = await Promise.all([
    supabase.from("inventory_items").select("*").is("deleted_at", null).order("name"),
    supabase.from("suppliers").select("id, name").is("deleted_at", null).order("name"),
    supabase
      .from("stock_movements")
      .select(
        "id, item_id, kind, quantity, unit_cost, reference, note, usage_type, job_id, created_at, inventory_items(name), jobs(job_number, plate_number, vehicle_make, vehicle_model)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("jobs")
      .select("id, job_number, vehicle_make, vehicle_model, plate_number, customer_name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("stock_movements")
      .select("item_id, created_at")
      .eq("kind", "out")
      .order("created_at", { ascending: false })
      .limit(5000),
  ])

  // Computed on the server so the "days" figure can't differ between SSR and hydration.
  const lastOut = new Map<string, string>()
  for (const o of outs ?? []) if (!lastOut.has(o.item_id)) lastOut.set(o.item_id, o.created_at)
  const now = Date.now()
  const stuck: Record<string, number> = {}
  for (const it of items ?? []) {
    if (!(Number(it.quantity) > 0)) continue
    const since = lastOut.get(it.id) ?? it.created_at
    if (!since) continue
    const days = Math.floor((now - new Date(since).getTime()) / 86_400_000)
    if (days >= STUCK_STOCK_DAYS) stuck[it.id] = days
  }

  // Strip purchase cost / supplier fields server-side so a viewer who lacks the
  // permission never receives them (selling price is gated separately).
  const perms = user.permissions
  const safeItems = (items ?? []).map((it) => stripSensitiveFields(perms, it as Record<string, unknown>))
  const safeMovements = (movements ?? []).map((m) => stripSensitiveFields(perms, m as Record<string, unknown>))
  // Supplier list is itself sensitive identity data.
  const safeSuppliers = canViewSuppliers(perms) ? (suppliers ?? []) : []
  // Movement history is a cost ledger; hide it entirely without cost visibility.
  const visibleMovements = canViewCosts(perms) ? safeMovements : []

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <InventoryClient
          items={safeItems as any[]}
          suppliers={safeSuppliers}
          movements={visibleMovements as any[]}
          jobs={jobs ?? []}
          stuckDays={stuck}
          canViewCosts={canViewCosts(perms)}
          canViewSuppliers={canViewSuppliers(perms)}
        />
      </div>
    </AppShell>
  )
}
