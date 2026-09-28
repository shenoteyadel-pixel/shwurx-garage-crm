"use server"

import { getSessionContext, logAction } from "@/lib/rbac/context"

/** Called right after a successful staff sign-in; audits it and alerts owners. */
export async function recordStaffLogin() {
  const ctx = await getSessionContext()
  if (!ctx?.isStaff) return
  await logAction(ctx, "user.login", "user", ctx.userId, { role: ctx.role })
}
