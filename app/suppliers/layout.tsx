import { requirePageAccess } from "@/lib/rbac/context"

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["parts.view"], "Suppliers")
  return <>{children}</>
}
