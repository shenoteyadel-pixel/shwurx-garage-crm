"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction, ForbiddenError } from "@/lib/rbac/context"
import { ROLE_MAP, ALL_PERMISSIONS, type Permission, type Role } from "@/lib/rbac/roles"
import { revalidatePath } from "next/cache"

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim()
}

/** Create a new staff user (owner/GM only) via the Supabase admin API. */
export async function createStaffUser(formData: FormData) {
  const ctx = await requirePermission("users.manage")
  const email = str(formData.get("email")).toLowerCase()
  const password = str(formData.get("password"))
  const fullName = str(formData.get("full_name"))
  const role = str(formData.get("role")) as Role

  if (!email || !password) throw new Error("Email and password are required.")
  if (password.length < 8) throw new Error("Password must be at least 8 characters.")
  const meta = ROLE_MAP[role]
  if (!meta || !meta.staff) throw new Error("Invalid staff role.")

  const svc = createServiceClient()
  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(error.message)

  const userId = created.user!.id
  // Upsert profile (a DB trigger may already have inserted a default row).
  const { error: pErr } = await svc.from("profiles").upsert(
    { id: userId, email, full_name: fullName || email, role, is_active: true },
    { onConflict: "id" },
  )
  if (pErr) throw new Error(pErr.message)

  await logAction(ctx, "user.create", "user", userId, { email, role })
  revalidatePath("/users")
}

/** Change a user's role. */
export async function updateUserRole(userId: string, role: Role) {
  const ctx = await requirePermission("users.manage")
  if (!ROLE_MAP[role]) throw new Error("Invalid role.")
  const svc = createServiceClient()
  const { error } = await svc.from("profiles").update({ role }).eq("id", userId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "user.update_role", "user", userId, { role })
  revalidatePath("/users")
}

/** Activate / deactivate a user (deactivated users lose all access). */
export async function setUserActive(userId: string, active: boolean) {
  const ctx = await requirePermission("users.manage")
  // Guard: never let an admin lock themselves out.
  if (userId === ctx.userId && !active) throw new Error("You cannot deactivate your own account.")
  const svc = createServiceClient()
  const { error } = await svc.from("profiles").update({ is_active: active }).eq("id", userId)
  if (error) throw new Error(error.message)
  await logAction(ctx, active ? "user.activate" : "user.deactivate", "user", userId)
  revalidatePath("/users")
}

/** Set or clear a per-user permission override. allowed=null removes it. */
export async function setPermissionOverride(userId: string, permission: Permission, allowed: boolean | null) {
  const ctx = await requirePermission("permissions.manage")
  if (!ALL_PERMISSIONS.includes(permission)) throw new Error("Unknown permission.")
  const svc = createServiceClient()
  if (allowed === null) {
    const { error } = await svc.from("permission_overrides").delete().eq("user_id", userId).eq("permission", permission)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await svc
      .from("permission_overrides")
      .upsert({ user_id: userId, permission, allowed }, { onConflict: "user_id,permission" })
    if (error) throw new Error(error.message)
  }
  await logAction(ctx, "permission.override", "user", userId, { permission, allowed })
  revalidatePath("/users")
}

/** Toggle a base role-permission in the editable matrix. */
export async function setRolePermission(role: Role, permission: Permission, allowed: boolean) {
  const ctx = await requirePermission("permissions.manage")
  // Owner is always all-powerful; block edits so it can't be locked down.
  if (role === "owner") throw new ForbiddenError("permissions.manage")
  if (!ALL_PERMISSIONS.includes(permission)) throw new Error("Unknown permission.")
  const svc = createServiceClient()
  const { error } = await svc
    .from("role_permissions")
    .upsert({ role, permission, allowed }, { onConflict: "role,permission" })
  if (error) throw new Error(error.message)
  await logAction(ctx, "role.permission_change", "role", role, { permission, allowed })
  revalidatePath("/users")
  revalidatePath("/users/permissions")
}
