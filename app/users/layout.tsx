import { requirePageAccess } from "@/lib/rbac/context"

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["users.manage", "permissions.manage"], "Users & Roles")
  return <>{children}</>
}
