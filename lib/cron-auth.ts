import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"

const digest = (v: string) => createHash("sha256").update(v).digest()

/** Constant-time check of "Authorization: Bearer CRON_SECRET". Fails closed when the secret is missing or too short. */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || !authorization) return false
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}
