import { requirePageAccess } from "@/lib/rbac/context"

export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["invoices.view"], "Invoices")
  return <>{children}</>
}
