import "server-only"
import { redirect } from "next/navigation"
import { getSessionContext } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import type { Permission } from "@/lib/rbac/roles"

export interface ShellUser {
  name: string
  role: string
  permissions: Permission[]
  isStaff: boolean
  customerId: string | null
}

// Fetches the current user's identity + effective permissions for the AppShell.
// Redirects to login when there is no authenticated user, and sends customers
// to their portal (they have no staff UI).
export async function getShellUser(): Promise<ShellUser> {
  const ctx = await getSessionContext()
  if (!ctx) redirect("/auth/login")
  if (!ctx.isActive) redirect("/auth/login?error=inactive")
  // Invited users must choose a password before they can use the app.
  if (ctx.mustSetPassword) redirect("/auth/set-password")
  if (!ctx.isStaff) redirect("/portal")

  // First successful staff visit after setting a password → mark active + stamp login.
  if (ctx.inviteStatus !== "active") {
    const svc = createServiceClient()
    await svc
      .from("profiles")
      .update({ invite_status: "active", last_login_at: new Date().toISOString() })
      .eq("id", ctx.userId)
  }

  return {
    name: ctx.name,
    role: ctx.role,
    permissions: [...ctx.permissions],
    isStaff: ctx.isStaff,
    customerId: ctx.customerId,
  }
}
