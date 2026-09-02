import { requirePageAccess } from "@/lib/rbac/context"

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["parts.view"], "Inventory")
  return <>{children}</>
}
