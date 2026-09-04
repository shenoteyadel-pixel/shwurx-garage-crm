import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { InventoryClient } from "@/components/inventory-client"
import { canViewCosts, canViewSuppliers, stripSensitiveFields } from "@/lib/rbac/visibility"

export const metadata = { title: "Store & Inventory · SHWURX Auto Service Center" }

export default async function InventoryPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const [{ data: items }, { data: suppliers }, { data: movements }] = await Promise.all([
    supabase.from("inventory_items").select("*").is("deleted_at", null).order("name"),
    supabase.from("suppliers").select("id, name").is("deleted_at", null).order("name"),
    supabase
      .from("stock_movements")
      .select("id, item_id, kind, quantity, unit_cost, reference, note, created_at, inventory_items(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

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
          canViewCosts={canViewCosts(perms)}
          canViewSuppliers={canViewSuppliers(perms)}
        />
      </div>
    </AppShell>
  )
}
