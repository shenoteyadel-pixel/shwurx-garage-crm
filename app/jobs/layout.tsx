import { requirePageAccess } from "@/lib/rbac/context"

export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["jobs.view_all", "jobs.view_assigned"], "Job Cards")
  return <>{children}</>
}
