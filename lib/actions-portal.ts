"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"

/**
 * Generate (or re-issue) a magic-link portal token for a customer. Returns the
 * absolute path a customer can open with no login. Staff-only.
 */
export async function issuePortalToken(customerId: string, days = 30): Promise<{ token: string; path: string }> {
  const ctx = await requirePermission("customers.edit")
  const svc = createServiceClient()

  const token = randomBytes(24).toString("base64url")
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString()

  const { error } = await svc.from("customer_portal_tokens").insert({
    customer_id: customerId,
    token,
    expires_at: expiresAt,
    created_by: ctx.userId,
  })
  if (error) throw new Error(error.message)

  await logAction(ctx, "portal.issue_token", "customer", customerId, { expires_at: expiresAt })
  revalidatePath(`/customers/${customerId}`)
  return { token, path: `/portal/t/${token}` }
}

/** Revoke all active portal tokens for a customer. Staff-only. */
export async function revokePortalTokens(customerId: string) {
  const ctx = await requirePermission("customers.edit")
  const svc = createServiceClient()
  const { error } = await svc
    .from("customer_portal_tokens")
    .update({ revoked: true })
    .eq("customer_id", customerId)
    .eq("revoked", false)
  if (error) throw new Error(error.message)
  await logAction(ctx, "portal.revoke_tokens", "customer", customerId)
  revalidatePath(`/customers/${customerId}`)
}


