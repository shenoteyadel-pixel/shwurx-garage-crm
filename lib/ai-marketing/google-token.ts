import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Server-only storage for the Google Ads OAuth refresh token.
 * A token obtained through the in-app OAuth flow is stored AES-256-GCM encrypted
 * in google_ads_oauth (RLS on, no policies → service role only) and takes priority
 * over the GOOGLE_ADS_REFRESH_TOKEN env var, because it is the most recent explicit
 * authorization by the owner.
 */
function encryptionKey() {
  const secret = process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error("No encryption secret available (set GOOGLE_ADS_TOKEN_ENCRYPTION_KEY).")
  return createHash("sha256").update(`google-ads-refresh:${secret}`).digest()
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".")
}

export function decryptToken(enc: string) {
  const [v, iv, tag, ct] = enc.split(".")
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised token format")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8")
}

export type RefreshTokenSource = "oauth" | "env" | null

export interface StoredAuthorization {
  authorizedAt: string
  authorizedByName: string | null
  scope: string | null
}

async function readStored(): Promise<{ token: string; meta: StoredAuthorization } | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const { data } = await createServiceClient()
    .from("google_ads_oauth")
    .select("refresh_token_enc, scope, authorized_by_name, authorized_at")
    .eq("id", 1)
    .maybeSingle()
  if (!data?.refresh_token_enc) return null
  try {
    return {
      token: decryptToken(data.refresh_token_enc),
      meta: { authorizedAt: data.authorized_at, authorizedByName: data.authorized_by_name, scope: data.scope },
    }
  } catch {
    return null
  }
}

export async function resolveRefreshToken(): Promise<{
  token: string | null
  source: RefreshTokenSource
  stored: StoredAuthorization | null
}> {
  const stored = await readStored().catch(() => null)
  if (stored) return { token: stored.token, source: "oauth", stored: stored.meta }
  const env = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim()
  if (env) return { token: env, source: "env", stored: null }
  return { token: null, source: null, stored: null }
}

export async function storeRefreshToken(token: string, scope: string | null, actor: { id: string; name: string }) {
  const { error } = await createServiceClient()
    .from("google_ads_oauth")
    .upsert({
      id: 1,
      refresh_token_enc: encryptToken(token),
      scope,
      authorized_by: actor.id,
      authorized_by_name: actor.name,
      authorized_at: new Date().toISOString(),
    })
  if (error) throw new Error(`Could not store Google authorization: ${error.message}`)
}

export async function deleteStoredRefreshToken() {
  const { error } = await createServiceClient().from("google_ads_oauth").delete().eq("id", 1)
  if (error) throw new Error(error.message)
}
