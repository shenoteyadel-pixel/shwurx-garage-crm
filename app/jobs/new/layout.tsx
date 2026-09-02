import { requirePageAccess } from "@/lib/rbac/context"

export default async function NewJobLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["jobs.create"], "New Job Card")
  return <>{children}</>
}
