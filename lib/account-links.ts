import "server-only"
import { createClient as createAdminClient } from "@supabase/supabase-js"

/**
 * Admin (service-role) client. Never expose to the browser.
 * Used only for generating secure auth action links and creating accounts.
 */
function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase admin credentials are not configured.")
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Absolute base URL for building the redirect target on generated links.
 * Prefers the v0/Supabase redirect proxy so callbacks reach the preview.
 */
function baseUrl() {
  const proxy = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  if (proxy) {
    // proxy already points at /auth/callback; strip it so we can append our own next target
    try {
      const u = new URL(proxy)
      return u.origin
    } catch {
      /* fall through */
    }
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

/** Absolute base URL for building customer-facing links (tracking, portal) in emails. */
export function appBaseUrl(): string {
  return baseUrl()
}

type LinkType = "invite" | "recovery" | "magiclink"

/**
 * Generates a secure Supabase action link (no plain-text password ever created).
 * Returns the actionable URL, routed through /auth/callback with a post-login target.
 */
export async function generateActionLink(opts: {
  email: string
  type: LinkType
  redirectPath?: string
}): Promise<string> {
  const sb = admin()
  const redirectTo = `${baseUrl()}/auth/callback?next=${encodeURIComponent(opts.redirectPath ?? "/auth/set-password")}`

  const { data, error } = await sb.auth.admin.generateLink({
    type: opts.type === "magiclink" ? "magiclink" : opts.type,
    email: opts.email,
    options: { redirectTo },
  } as Parameters<typeof sb.auth.admin.generateLink>[0])

  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message ?? "Could not generate the account link.")
  }
  return data.properties.action_link
}

/**
 * Creates a confirmed auth user WITHOUT a usable password.
 * The user must set their password via the invite/recovery link.
 * Returns the created user id, or the existing id if the email already exists.
 */
export async function createManagedAuthUser(opts: {
  email: string
  metadata?: Record<string, unknown>
}): Promise<{ userId: string; alreadyExisted: boolean }> {
  const sb = admin()
  const { data, error } = await sb.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: opts.metadata ?? {},
  })

  if (error) {
    // If the user already exists, look them up instead of failing.
    if (/already/i.test(error.message)) {
      const existing = await findUserByEmail(opts.email)
      if (existing) return { userId: existing, alreadyExisted: true }
    }
    throw new Error(error.message)
  }
  return { userId: data.user!.id, alreadyExisted: false }
}

/** Finds an auth user id by email using the admin API. */
export async function findUserByEmail(email: string): Promise<string | null> {
  const sb = admin()
  const target = email.trim().toLowerCase()
  // Paginate defensively; most workshops have few users.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target)
    if (match) return match.id
    if (data.users.length < 200) break
  }
  return null
}

/** Deletes an auth user (used when profile creation fails, to avoid orphans). */
export async function deleteAuthUser(userId: string): Promise<void> {
  const sb = admin()
  await sb.auth.admin.deleteUser(userId)
}

/**
 * Revokes all active sessions for a user (force logout everywhere).
 * The user must sign in again on their next request.
 */
export async function signOutUserEverywhere(userId: string): Promise<void> {
  const sb = admin()
  const { error } = await sb.auth.admin.signOut(userId, "global")
  if (error) throw new Error(error.message)
}

/** Returns the auth user's metadata and confirmation/sign-in timestamps. */
export async function getAuthUserState(
  userId: string,
): Promise<{ lastSignInAt: string | null; hasPassword: boolean } | null> {
  const sb = admin()
  const { data, error } = await sb.auth.admin.getUserById(userId)
  if (error || !data?.user) return null
  return {
    lastSignInAt: data.user.last_sign_in_at ?? null,
    // A managed user starts with no password; once set, providers include "email".
    hasPassword: (data.user.app_metadata?.providers as string[] | undefined)?.includes("email") ?? false,
  }
}
