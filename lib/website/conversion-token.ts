import "server-only"
import { createHmac } from "node:crypto"

/**
 * Opaque, stable conversion identity for a persisted record. Deterministic in
 * (outcome, record id), so a retry returning "duplicate" yields the same token
 * and Google Ads can dedupe on it as transaction_id. Not reversible to the
 * record id and contains no customer data.
 */
export function conversionToken(outcome: "lead" | "appointment", recordId: string): string | null {
  const secret = process.env.CONVERSION_TOKEN_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!secret || !recordId) return null
  return createHmac("sha256", secret).update(`shwurx-conv-v1:${outcome}:${recordId}`).digest("base64url").slice(0, 32)
}

/** Authenticated Website Center diagnostic only; never returns the key or a token. */
export function conversionSigningReady(): boolean {
  return !!(process.env.CONVERSION_TOKEN_SECRET || process.env.SUPABASE_JWT_SECRET)
}
