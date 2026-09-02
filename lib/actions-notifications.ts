"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Permission } from "@/lib/rbac/roles"

// Mark a single notification read (RLS ensures ownership).
export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  await supabase.from("notifications").update({ read: true }).eq("id", id)
}

// Mark all of the current user's notifications read.
export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false)
}

/**
 * Fan-out helper: notify every active staff user who holds a given permission.
 * Uses the service-role client so it can read profiles/matrix and insert
 * notifications regardless of the caller's RLS scope. Server-only.
 */
export async function notifyByPermission(
  permission: Permission,
  payload: { title: string; body?: string; type?: string; link?: string },
) {
  const svc = createServiceClient()

  // Roles that hold the permission (ignoring per-user overrides for fan-out).
  const { data: roleRows } = await svc
    .from("role_permissions")
    .select("role")
    .eq("permission", permission)
    .eq("allowed", true)
  const roles = (roleRows ?? []).map((r) => r.role)
  if (!roles.length) return

  const { data: users } = await svc
    .from("profiles")
    .select("id")
    .in("role", roles)
    .eq("is_active", true)
  if (!users?.length) return

  await svc.from("notifications").insert(
    users.map((u) => ({
      user_id: u.id,
      title: payload.title,
      body: payload.body ?? null,
      type: payload.type ?? "info",
      link: payload.link ?? null,
    })),
  )
}

// Notify one specific user.
export async function notifyUser(
  userId: string,
  payload: { title: string; body?: string; type?: string; link?: string },
) {
  const svc = createServiceClient()
  await svc.from("notifications").insert({
    user_id: userId,
    title: payload.title,
    body: payload.body ?? null,
    type: payload.type ?? "info",
    link: payload.link ?? null,
  })
}
