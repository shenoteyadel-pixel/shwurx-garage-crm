import { requirePageAccess } from "@/lib/rbac/context"

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["customers.view"], "Customers")
  return <>{children}</>
}
