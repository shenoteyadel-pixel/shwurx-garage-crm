"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction, ForbiddenError } from "@/lib/rbac/context"
import { ROLE_MAP, ALL_PERMISSIONS, type Permission, type Role } from "@/lib/rbac/roles"
import {
  generateActionLink,
  createManagedAuthUser,
  deleteAuthUser,
  signOutUserEverywhere,
} from "@/lib/account-links"
import { sendEmail, staffInviteEmail, resetPasswordEmail } from "@/lib/email"
import { notifyOwners } from "@/lib/actions-notifications"
import { revalidatePath } from "next/cache"

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim()
}

/**
 * Safe, serializable result for mutations. We deliberately RETURN errors as
 * data instead of throwing: in production Next.js redacts every *thrown*
 * Server Action error to the generic "Minified React error #441" digest, which
 * hides the real reason from the Owner. Returned values are never redacted, so
 * the true error text always reaches the UI.
 */
export type ActionResult = { ok: true } | { ok: false; error: string }

/** Extract a human-readable message from any thrown value. */
function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return "Something went wrong. Please try again."
}

export type CredentialLinkResult = {
  ok: boolean
  error?: string
  email: string
  link: string
  emailSent: boolean
  emailError?: string
  userId: string
  /** enrichment for the success popup + WhatsApp message */
  fullName?: string
  mobile?: string | null
  roleLabel?: string
  jobTitle?: string | null
}

/** Build a hard-failure CredentialLinkResult (couldn't even start the flow). */
function credFail(error: string): CredentialLinkResult {
  return { ok: false, error, email: "", link: "", emailSent: false, userId: "" }
}

export type DuplicateMatch = {
  id: string
  full_name: string | null
  email: string | null
  mobile: string | null
  employee_id: string | null
  role: string
  match_on: string
}

/**
 * Look for existing staff that would clash with a new invite, so the admin
 * can be warned BEFORE creating a duplicate. Matches on email, mobile, or
 * employee id (case-insensitive).
 */
export async function searchExistingUsers(input: {
  email?: string
  mobile?: string
  employeeId?: string
}): Promise<DuplicateMatch[]> {
  await requirePermission("users.manage")
  const email = str(input.email ?? "").toLowerCase()
  const mobile = str(input.mobile ?? "")
  const employeeId = str(input.employeeId ?? "").toLowerCase()
  if (!email && !mobile && !employeeId) return []

  const svc = createServiceClient()
  const ors: string[] = []
  if (email) ors.push(`email.ilike.${email}`)
  if (mobile) ors.push(`mobile.eq.${mobile}`, `phone.eq.${mobile}`)
  if (employeeId) ors.push(`employee_id.ilike.${employeeId}`)

  const { data } = await svc
    .from("profiles")
    .select("id, full_name, email, mobile, phone, employee_id, role")
    .or(ors.join(","))
    .neq("role", "customer")
    .limit(10)

  return (data ?? []).map((p) => {
    const matches: string[] = []
    if (email && (p.email ?? "").toLowerCase() === email) matches.push("email")
    if (mobile && (p.mobile === mobile || p.phone === mobile)) matches.push("mobile")
    if (employeeId && (p.employee_id ?? "").toLowerCase() === employeeId) matches.push("employee ID")
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      mobile: p.mobile ?? p.phone,
      employee_id: p.employee_id,
      role: p.role,
      match_on: matches.join(" + ") || "existing record",
    }
  })
}

/**
 * Invite a new staff user (owner/GM only).
 * Creates a confirmed account WITHOUT a password, then generates a secure
 * set-password link. The link is emailed automatically (Resend) and also
 * returned so the admin can copy / WhatsApp / email it manually.
 * No plain-text password is ever created or stored.
 */
export async function inviteStaffUser(formData: FormData): Promise<CredentialLinkResult> {
  try {
    return await inviteStaffUserInner(formData)
  } catch (e) {
    return credFail(errMsg(e))
  }
}

async function inviteStaffUserInner(formData: FormData): Promise<CredentialLinkResult> {
  const ctx = await requirePermission("users.manage")
  const email = str(formData.get("email")).toLowerCase()
  const fullName = str(formData.get("full_name"))
  const mobile = str(formData.get("mobile") || formData.get("phone"))
  const role = str(formData.get("role")) as Role
  const department = str(formData.get("department"))
  const branch = str(formData.get("branch"))
  const employeeId = str(formData.get("employee_id"))
  const jobTitle = str(formData.get("job_title"))
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const allowDuplicate = str(formData.get("allow_duplicate")) === "true"

  if (!email) return credFail("Email is required.")
  if (!fullName) return credFail("Full name is required.")
  const meta = ROLE_MAP[role]
  if (!meta || !meta.staff) return credFail("Please choose a valid staff role.")

  // Server-side duplicate guard (the UI pre-checks, but never trust the client).
  if (!allowDuplicate) {
    const dupes = await searchExistingUsers({ email, mobile, employeeId })
    if (dupes.length) {
      return credFail(
        `A staff member already matches this ${dupes[0].match_on} (${dupes[0].full_name ?? dupes[0].email}). Use "Invite anyway" to proceed.`,
      )
    }
  }

  const svc = createServiceClient()
  const now = new Date().toISOString()

  // Create (or reuse) the auth account without a password.
  const { userId, alreadyExisted } = await createManagedAuthUser({
    email,
    metadata: { full_name: fullName, must_set_password: true },
  })

  // Generate the secure set-password link first so we can record the true status.
  let link = ""
  let linkError: string | undefined
  try {
    link = await generateActionLink({
      email,
      type: alreadyExisted ? "recovery" : "invite",
      redirectPath: "/auth/set-password",
    })
  } catch (e) {
    linkError = (e as Error).message
  }

  const send = link
    ? await sendEmail({
        to: email,
        subject: "Set up your Shwurx Garage account",
        html: staffInviteEmail({ fullName, roleLabel: meta.label, url: link }),
        idempotencyKey: `staff-invite/${userId}/${now}`,
      })
    : { sent: false, error: linkError }

  const inviteStatus = send.sent ? "invited" : "email_failed"

  // Upsert the profile; roll back a brand-new auth user if the profile write fails.
  const { error: pErr } = await svc.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      mobile: mobile || null,
      phone: mobile || null,
      role,
      job_title: jobTitle || null,
      skills: skills.length ? skills : [],
      department: department || null,
      branch: branch || null,
      employee_id: employeeId || null,
      is_active: true,
      must_set_password: true,
      invited_at: now,
      invited_by: ctx.userId,
      invite_status: inviteStatus,
      invite_sent_at: now,
      invite_error: send.error ?? null,
    },
    { onConflict: "id" },
  )
  if (pErr) {
    if (!alreadyExisted) await deleteAuthUser(userId).catch(() => {})
    return credFail(pErr.message)
  }

  await logAction(ctx, "user.invite", "user", userId, { email, role, emailSent: send.sent })
  await notifyOwners({
    title: "New staff account created",
    body: `${fullName} (${meta.label}) was invited by ${ctx.name ?? "an admin"}.`,
    type: "user",
    link: "/users",
  }).catch(() => {})

  revalidatePath("/users")
  return {
    ok: true,
    userId,
    email,
    link,
    emailSent: send.sent,
    emailError: send.error,
    fullName,
    mobile: mobile || null,
    roleLabel: meta.label,
    jobTitle: jobTitle || null,
  }
}

/** Resend a set-password invite for a user who hasn't set their password yet. */
export async function resendStaffInvite(userId: string): Promise<CredentialLinkResult> {
  try {
    const ctx = await requirePermission("users.manage")
    const svc = createServiceClient()
    const { data: profile, error } = await svc
      .from("profiles")
      .select("email, full_name, role, mobile, phone, job_title")
      .eq("id", userId)
      .maybeSingle()
    if (error || !profile?.email) return credFail("User not found.")

    const meta = ROLE_MAP[profile.role as Role]
    const now = new Date().toISOString()
    const link = await generateActionLink({ email: profile.email, type: "invite", redirectPath: "/auth/set-password" })
    const send = await sendEmail({
      to: profile.email,
      subject: "Set up your Shwurx Garage account",
      html: staffInviteEmail({ fullName: profile.full_name ?? "", roleLabel: meta?.label ?? "staff", url: link }),
    })
    await svc
      .from("profiles")
      .update({
        invite_status: send.sent ? "invited" : "email_failed",
        invite_sent_at: now,
        invite_error: send.error ?? null,
      })
      .eq("id", userId)
    await logAction(ctx, "user.invite_resend", "user", userId, { emailSent: send.sent })
    revalidatePath("/users")
    return {
      ok: true,
      userId,
      email: profile.email,
      link,
      emailSent: send.sent,
      emailError: send.error,
      fullName: profile.full_name ?? "",
      mobile: profile.mobile ?? profile.phone ?? null,
      roleLabel: meta?.label ?? "staff",
      jobTitle: profile.job_title ?? null,
    }
  } catch (e) {
    return credFail(errMsg(e))
  }
}

/** Send a password-reset link for an existing user. */
export async function sendPasswordReset(userId: string): Promise<CredentialLinkResult> {
  try {
    const ctx = await requirePermission("users.manage")
    const svc = createServiceClient()
    const { data: profile, error } = await svc
      .from("profiles")
      .select("email, full_name, role, mobile, phone, job_title")
      .eq("id", userId)
      .maybeSingle()
    if (error || !profile?.email) return credFail("User not found.")

    const link = await generateActionLink({ email: profile.email, type: "recovery", redirectPath: "/auth/set-password" })
    const send = await sendEmail({
      to: profile.email,
      subject: "Reset your Shwurx Garage password",
      html: resetPasswordEmail({ fullName: profile.full_name ?? "", url: link }),
    })
    await logAction(ctx, "user.password_reset", "user", userId, { emailSent: send.sent })
    revalidatePath("/users")
    return {
      ok: true,
      userId,
      email: profile.email,
      link,
      emailSent: send.sent,
      emailError: send.error,
      fullName: profile.full_name ?? "",
      mobile: profile.mobile ?? profile.phone ?? null,
      roleLabel: ROLE_MAP[profile.role as Role]?.label ?? "staff",
      jobTitle: profile.job_title ?? null,
    }
  } catch (e) {
    return credFail(errMsg(e))
  }
}

/**
 * Called by the set-password page after the user chooses their password.
 * Self-scoped (uses the caller's own session), so no admin permission needed.
 * Marks the invite accepted and returns the role home to redirect to.
 */
export async function markPasswordSet(): Promise<{ home: string }> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("No active session.")

  const svc = createServiceClient()
  const now = new Date().toISOString()
  const { data: profile } = await svc
    .from("profiles")
    .update({ must_set_password: false, invite_status: "accepted", password_set_at: now })
    .eq("id", user.id)
    .select("role")
    .maybeSingle()

  await notifyOwners({
    title: "Staff account activated",
    body: `${user.email} has set their password.`,
    type: "user",
    link: "/users",
  }).catch(() => {})

  const { roleHome } = await import("@/lib/rbac/roles")
  return { home: roleHome(profile?.role) }
}

/** Force logout: revoke every active session for a user (owner/GM control). */
export async function forceLogoutUser(userId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("users.manage")
    if (userId === ctx.userId) return { ok: false, error: "You cannot force-logout your own session here." }
    const svc = createServiceClient()
    await signOutUserEverywhere(userId).catch(() => {})
    await svc.from("profiles").update({ session_revoked_at: new Date().toISOString() }).eq("id", userId)
    await logAction(ctx, "user.force_logout", "user", userId)
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** Change a user's role. */
export async function updateUserRole(userId: string, role: Role): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("users.manage")
    if (!ROLE_MAP[role]) return { ok: false, error: "Invalid role." }
    const svc = createServiceClient()
    const { error } = await svc.from("profiles").update({ role }).eq("id", userId)
    if (error) return { ok: false, error: error.message }
    await logAction(ctx, "user.update_role", "user", userId, { role })
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** Activate / deactivate a user (deactivated users lose all access). */
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("users.manage")
    // Guard: never let an admin lock themselves out.
    if (userId === ctx.userId && !active) return { ok: false, error: "You cannot deactivate your own account." }
    const svc = createServiceClient()
    const { error } = await svc.from("profiles").update({ is_active: active }).eq("id", userId)
    if (error) return { ok: false, error: error.message }
    await logAction(ctx, active ? "user.activate" : "user.deactivate", "user", userId)
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** Set or clear a per-user permission override. allowed=null removes it. */
export async function setPermissionOverride(
  userId: string,
  permission: Permission,
  allowed: boolean | null,
): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("permissions.manage")
    if (!ALL_PERMISSIONS.includes(permission)) return { ok: false, error: "Unknown permission." }
    const svc = createServiceClient()
    if (allowed === null) {
      const { error } = await svc
        .from("permission_overrides")
        .delete()
        .eq("user_id", userId)
        .eq("permission", permission)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await svc
        .from("permission_overrides")
        .upsert({ user_id: userId, permission, allowed }, { onConflict: "user_id,permission" })
      if (error) return { ok: false, error: error.message }
    }
    await logAction(ctx, "permission.override", "user", userId, { permission, allowed })
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Update a staff member's HR/profile fields (job title, department, skills,
 * mobile, employee id, branch, full name). Owner/GM control. Does NOT change
 * role or security — role has its own dedicated action.
 */
export async function updateStaffProfile(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("users.manage")
    const svc = createServiceClient()

    const patch: Record<string, unknown> = {}
    const fullName = str(formData.get("full_name"))
    if (fullName) patch.full_name = fullName
    if (formData.has("job_title")) patch.job_title = str(formData.get("job_title")) || null
    if (formData.has("department")) patch.department = str(formData.get("department")) || null
    if (formData.has("branch")) patch.branch = str(formData.get("branch")) || null
    if (formData.has("employee_id")) patch.employee_id = str(formData.get("employee_id")) || null
    if (formData.has("mobile")) {
      const mobile = str(formData.get("mobile"))
      patch.mobile = mobile || null
      patch.phone = mobile || null
    }
    if (formData.has("skills")) {
      patch.skills = String(formData.get("skills") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }

    if (Object.keys(patch).length === 0) return { ok: true }
    const { error } = await svc.from("profiles").update(patch).eq("id", userId)
    if (error) return { ok: false, error: error.message }
    await logAction(ctx, "user.update_profile", "user", userId, { fields: Object.keys(patch) })
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Permanently delete a staff user (owner only).
 * History-safe: audit logs, jobs and other records reference the profile by id
 * but survive because we first NULL out live assignment pointers, then remove
 * the auth account and profile. Past job cards keep their denormalized names.
 */
export async function deleteStaffUser(userId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("users.manage")
    // Deleting users is the most destructive action — restrict to owner.
    if (ctx.role !== "owner") return { ok: false, error: "Only the Owner can permanently delete a staff user." }
    if (userId === ctx.userId) return { ok: false, error: "You cannot delete your own account." }

    const svc = createServiceClient()
    const { data: target } = await svc
      .from("profiles")
      .select("email, full_name, role")
      .eq("id", userId)
      .maybeSingle()
    if (!target) return { ok: false, error: "User not found — they may already have been deleted." }
    if (target.role === "owner") return { ok: false, error: "Owner accounts cannot be deleted." }

    // Detach live assignment pointers so active work isn't orphaned to a missing id.
    // Denormalized name columns on jobs stay intact for historical accuracy, and
    // created_by is preserved as an immutable record of who opened each job (it
    // does not affect live routing). All FKs to profiles are ON DELETE SET NULL
    // or CASCADE, so historical job cards, invoices and audit logs are preserved.
    await svc.from("jobs").update({ technician_id: null }).eq("technician_id", userId)
    await svc.from("jobs").update({ advisor_id: null }).eq("advisor_id", userId)

    // Revoke sessions, then remove auth user and profile. External auth calls are
    // best-effort so a transient auth-service hiccup can't block the delete.
    await signOutUserEverywhere(userId).catch(() => {})
    await deleteAuthUser(userId).catch(() => {})
    const { error } = await svc.from("profiles").delete().eq("id", userId)
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, "user.delete", "user", userId, { email: target.email, role: target.role })
    await notifyOwners({
      title: "Staff account deleted",
      body: `${target.full_name ?? target.email} was deleted by ${ctx.name ?? "an admin"}.`,
      type: "user",
      link: "/users",
    }).catch(() => {})
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Generate a fresh secure link for a user WITHOUT sending an email — used by
 * the "Copy login link" action so an admin can share it via WhatsApp/manually.
 * kind "set" for first-time setup, "reset" for a password reset.
 */
export type LoginLinkResult =
  | {
      ok: true
      link: string
      email: string
      fullName: string
      mobile: string | null
      roleLabel: string
      jobTitle: string | null
    }
  | { ok: false; error: string }

export async function getLoginLink(userId: string, kind: "set" | "reset" = "set"): Promise<LoginLinkResult> {
  try {
    const ctx = await requirePermission("users.manage")
    const svc = createServiceClient()
    const { data: profile, error } = await svc
      .from("profiles")
      .select("email, full_name, mobile, phone, role, job_title")
      .eq("id", userId)
      .maybeSingle()
    if (error || !profile?.email) return { ok: false, error: "User not found." }

    const link = await generateActionLink({
      email: profile.email,
      type: kind === "reset" ? "recovery" : "invite",
      redirectPath: "/auth/set-password",
    })
    await logAction(ctx, "user.copy_link", "user", userId, { kind })
    return {
      ok: true,
      link,
      email: profile.email,
      fullName: profile.full_name ?? "",
      mobile: profile.mobile ?? profile.phone ?? null,
      roleLabel: ROLE_MAP[profile.role as Role]?.label ?? profile.role,
      jobTitle: profile.job_title ?? null,
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
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
