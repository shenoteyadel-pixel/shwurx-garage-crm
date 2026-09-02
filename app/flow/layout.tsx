import { requirePageAccess } from "@/lib/rbac/context"

export default async function FlowLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["jobs.view_all"], "Car Flow")
  return <>{children}</>
}
