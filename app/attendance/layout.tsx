import { requireStaff } from "@/lib/rbac/context"

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  await requireStaff()
  return <>{children}</>
}
