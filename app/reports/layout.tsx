import { requirePageAccess } from "@/lib/rbac/context"

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["reports.view"], "Reports")
  return <>{children}</>
}
