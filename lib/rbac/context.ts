import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { Permission, Role } from "@/lib/rbac/roles"
import { ALL_PERMISSIONS } from "@/lib/rbac/roles"

export interface SessionContext {
  userId: string
  email: string | null
  name: string
  role: Role
  isActive: boolean
  isStaff: boolean
  customerId: string | null
  /** true until the invited user chooses their own password */
  mustSetPassword: boolean
  /** invite lifecycle status from profiles.invite_status */
  inviteStatus: string
  /** resolved effective permission set (role defaults + per-user overrides) */
  permissions: Set<Permission>
}

/**
 * Resolves the current authenticated user's RBAC context.
 * Returns null when there is no authenticated user.
 * Memoized per-request via React cache().
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active, customer_id, email, must_set_password, invite_status")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile?.role ?? "viewer") as Role
  const isActive = profile?.is_active ?? true

  // Effective permissions: role defaults, then per-user overrides win.
  const perms = new Set<Permission>()
  if (isActive) {
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission, allowed")
      .eq("role", role)
    for (const rp of rolePerms ?? []) {
      if (rp.allowed && (ALL_PERMISSIONS as string[]).includes(rp.permission)) {
        perms.add(rp.permission as Permission)
      }
    }
    const { data: overrides } = await supabase
      .from("permission_overrides")
      .select("permission, allowed")
      .eq("user_id", user.id)
    for (const ov of overrides ?? []) {
      if (!(ALL_PERMISSIONS as string[]).includes(ov.permission)) continue
      if (ov.allowed) perms.add(ov.permission as Permission)
      else perms.delete(ov.permission as Permission)
    }
  }

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? null,
    name: profile?.full_name || user.email || "User",
    role,
    isActive,
    isStaff: isActive && role !== "customer",
    customerId: profile?.customer_id ?? null,
    mustSetPassword: profile?.must_set_password ?? false,
    inviteStatus: profile?.invite_status ?? "not_sent",
    permissions: perms,
  }
})

/** Require an authenticated user; redirect to login otherwise. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext()
  if (!ctx) redirect("/auth/login")
  if (!ctx.isActive) redirect("/auth/login?error=inactive")
  return ctx
}

/** Require an authenticated STAFF user (not a customer). */
export async function requireStaff(): Promise<SessionContext> {
  const ctx = await requireSession()
  if (!ctx.isStaff) redirect("/portal")
  return ctx
}

export function ctxCan(ctx: SessionContext | null, perm: Permission): boolean {
  return !!ctx && ctx.isActive && ctx.permissions.has(perm)
}

export function ctxCanAny(ctx: SessionContext | null, perms: Permission[]): boolean {
  return perms.some((p) => ctxCan(ctx, p))
}

/** Convenience: check a permission for the current request. */
export async function can(perm: Permission): Promise<boolean> {
  const ctx = await getSessionContext()
  return ctxCan(ctx, perm)
}

/**
 * Page/route guard. Ensures the user is authenticated staff and holds at least
 * one of the given permissions; otherwise redirects to the Access Denied page.
 * Use in section `layout.tsx` files.
 */
export async function requirePageAccess(anyOf: Permission[], label?: string): Promise<SessionContext> {
  const ctx = await requireStaff()
  if (!anyOf.some((p) => ctxCan(ctx, p))) {
    const qs = label ? `?from=${encodeURIComponent(label)}` : ""
    redirect(`/denied${qs}`)
  }
  return ctx
}

/**
 * Guard for server actions & privileged reads. Throws a typed error when the
 * user lacks the permission — callers surface this to the UI. Also writes a
 * denied entry to the audit log.
 */
export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super("You do not have permission to perform this action.")
    this.name = "ForbiddenError"
  }
}

export async function requirePermission(perm: Permission): Promise<SessionContext> {
  const ctx = await requireSession()
  if (!ctxCan(ctx, perm)) {
    await writeAudit({
      actorId: ctx.userId,
      actorName: ctx.name,
      actorRole: ctx.role,
      action: "permission_denied",
      resourceType: "permission",
      resourceId: perm,
      status: "denied",
    })
    throw new ForbiddenError(perm)
  }
  return ctx
}

// ---------------- Audit logging ----------------

export interface AuditEntry {
  actorId?: string | null
  actorName?: string | null
  actorRole?: string | null
  action: string
  resourceType?: string | null
  resourceId?: string | null
  detail?: Record<string, unknown> | null
  status?: "ok" | "denied" | "error"
}

/**
 * Writes an audit log entry using the service-role client so it always
 * succeeds regardless of the actor's RLS scope. Never throws — auditing must
 * not break the underlying action.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const svc = createServiceClient()
    await svc.from("audit_logs").insert({
      actor_id: entry.actorId ?? null,
      actor_name: entry.actorName ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId != null ? String(entry.resourceId) : null,
      detail: entry.detail ?? null,
      status: entry.status ?? "ok",
    })
  } catch (err) {
    console.log("[v0] audit write failed:", (err as Error)?.message)
  }
}

/** Log a successful action for the current user. */
export async function logAction(
  ctx: SessionContext,
  action: string,
  resourceType?: string,
  resourceId?: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await writeAudit({
    actorId: ctx.userId,
    actorName: ctx.name,
    actorRole: ctx.role,
    action,
    resourceType,
    resourceId,
    detail,
    status: "ok",
  })
}
