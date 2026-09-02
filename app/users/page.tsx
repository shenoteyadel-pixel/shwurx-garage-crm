import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { UserManagement } from "@/components/admin/user-management"
import { ShieldCheck, SlidersHorizontal } from "lucide-react"

export const metadata = { title: "Users & Roles · SHWURX Garage" }

export default async function UsersPage() {
  const [shellUser, ctx] = await Promise.all([getShellUser(), getSessionContext()])
  const canManageUsers = ctx!.permissions.has("users.manage")
  const canManagePerms = ctx!.permissions.has("permissions.manage")

  const svc = createServiceClient()
  const [{ data: profiles }, { data: overrides }] = await Promise.all([
    svc
      .from("profiles")
      .select(
        "id, email, full_name, role, is_active, customer_id, created_at, phone, mobile, must_set_password, department, branch, employee_id, job_title, skills, invite_status, invite_sent_at, invite_error, last_login_at",
      )
      .neq("role", "customer")
      .order("created_at", { ascending: true }),
    svc.from("permission_overrides").select("user_id, permission, allowed"),
  ])

  return (
    <AppShell user={shellUser}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" /> Users &amp; Roles
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage staff accounts, assign roles, and fine-tune individual permissions.
          </p>
        </div>
        {canManagePerms && (
          <Link
            href="/users/permissions"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"
          >
            <SlidersHorizontal className="h-4 w-4" /> Edit Permission Matrix
          </Link>
        )}
      </div>

      <UserManagement
        users={profiles ?? []}
        overrides={overrides ?? []}
        currentUserId={ctx!.userId}
        canManageUsers={canManageUsers}
        canManagePerms={canManagePerms}
        isOwner={ctx!.role === "owner"}
      />
    </AppShell>
  )
}
