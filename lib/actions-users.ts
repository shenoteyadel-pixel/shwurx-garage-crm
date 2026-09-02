"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction, ForbiddenError } from "@/lib/rbac/context"
import { ROLE_MAP, ALL_PERMISSIONS, type Permission, type Role } from "@/lib/rbac/roles"
import { generateActionLink, createManagedAuthUser, deleteAuthUser } from "@/lib/account-links"
import { sendEmail, staffInviteEmail, resetPasswordEmail } from "@/lib/email"
import { revalidatePath } from "next/cache"

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim()
}

export type CredentialLinkResult = {
  email: string
  link: string
  emailSent: boolean
  emailError?: string
}

/**
 * Invite a new staff user (owner/GM only).
 * Creates a confirmed account WITHOUT a password, then generates a secure
 * set-password link. The link is emailed automatically (Resend) and also
 * returned so the admin can copy / WhatsApp / email it manually.
 * No plain-text password is ever created or stored.
 */
export async function inviteStaffUser(formData: FormData): Promise<CredentialLinkResult> {
  const ctx = await requirePermission("users.manage")
  const email = str(formData.get("email")).toLowerCase()
  const fullName = str(formData.get("full_name"))
  const phone = str(formData.get("phone"))
  const role = str(formData.get("role")) as Role

  if (!email) throw new Error("Email is required.")
  const meta = ROLE_MAP[role]
  if (!meta || !meta.staff) throw new Error("Invalid staff role.")

  const svc = createServiceClient()

  // Create (or reuse) the auth account without a password.
  const { userId, alreadyExisted } = await createManagedAuthUser({
    email,
    metadata: { full_name: fullName, must_set_password: true },
  })

  // Upsert the profile; roll back the auth user if this is a brand-new account and profile write fails.
  const { error: pErr } = await svc.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName || email,
      phone: phone || null,
      role,
      is_active: true,
      must_set_password: true,
      invited_at: new Date().toISOString(),
      invited_by: ctx.userId,
    },
    { onConflict: "id" },
  )
  if (pErr) {
    if (!alreadyExisted) await deleteAuthUser(userId).catch(() => {})
    throw new Error(pErr.message)
  }

  // Generate the secure set-password link (invite for new accounts, recovery for existing).
  const link = await generateActionLink({
    email,
    type: alreadyExisted ? "recovery" : "invite",
    redirectPath: "/auth/set-password",
  })

  const send = await sendEmail({
    to: email,
    subject: "Set up your Shwurx Garage account",
    html: staffInviteEmail({ fullName, roleLabel: meta.label, url: link }),
    idempotencyKey: `staff-invite/${userId}`,
  })

  await logAction(ctx, "user.invite", "user", userId, { email, role, emailSent: send.sent })
  revalidatePath("/users")
  return { email, link, emailSent: send.sent, emailError: send.error }
}

/** Resend a set-password invite for a user who hasn't set their password yet. */
export async function resendStaffInvite(userId: string): Promise<CredentialLinkResult> {
  const ctx = await requirePermission("users.manage")
  const svc = createServiceClient()
  const { data: profile, error } = await svc
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", userId)
    .maybeSingle()
  if (error || !profile?.email) throw new Error("User not found.")

  const meta = ROLE_MAP[profile.role as Role]
  const link = await generateActionLink({ email: profile.email, type: "invite", redirectPath: "/auth/set-password" })
  const send = await sendEmail({
    to: profile.email,
    subject: "Set up your Shwurx Garage account",
    html: staffInviteEmail({ fullName: profile.full_name ?? "", roleLabel: meta?.label ?? "staff", url: link }),
  })
  await logAction(ctx, "user.invite_resend", "user", userId, { emailSent: send.sent })
  return { email: profile.email, link, emailSent: send.sent, emailError: send.error }
}

/** Send a password-reset link for an existing user. */
export async function sendPasswordReset(userId: string): Promise<CredentialLinkResult> {
  const ctx = await requirePermission("users.manage")
  const svc = createServiceClient()
  const { data: profile, error } = await svc
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle()
  if (error || !profile?.email) throw new Error("User not found.")

  const link = await generateActionLink({ email: profile.email, type: "recovery", redirectPath: "/auth/set-password" })
  const send = await sendEmail({
    to: profile.email,
    subject: "Reset your Shwurx Garage password",
    html: resetPasswordEmail({ fullName: profile.full_name ?? "", url: link }),
  })
  await logAction(ctx, "user.password_reset", "user", userId, { emailSent: send.sent })
  return { email: profile.email, link, emailSent: send.sent, emailError: send.error }
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
