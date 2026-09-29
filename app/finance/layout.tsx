import { requirePageAccess } from "@/lib/rbac/context"

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["reports.financial", "payments.view"], "Finance")
  return <>{children}</>
}
