import { requirePageAccess } from "@/lib/rbac/context"

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["purchase_orders.manage", "parts.view"], "Purchasing")
  return <>{children}</>
}
