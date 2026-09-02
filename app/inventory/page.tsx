import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { InventoryClient } from "@/components/inventory-client"

export const metadata = { title: "Store & Inventory · SHWURX Garage" }

export default async function InventoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [{ data: items }, { data: suppliers }, { data: movements }] = await Promise.all([
    supabase.from("inventory_items").select("*").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("stock_movements")
      .select("id, item_id, kind, quantity, unit_cost, reference, note, created_at, inventory_items(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  return (
    <div className="mx-auto max-w-6xl">
      <InventoryClient
        items={items ?? []}
        suppliers={suppliers ?? []}
        movements={(movements ?? []) as any[]}
      />
    </div>
  )
}
