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
 * Returns a normalized absolute origin for a configured site URL, or undefined
 * when the value is missing/malformed. Guards against data-entry mistakes such
 * as pasting the variable NAME ("NEXT_PUBLIC_SITE_URL") into the value field,
 * which would otherwise produce an invalid host like https://NEXT_PUBLIC_SITE_URL
 * and break every generated link.
 */
function siteUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return undefined
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(candidate)
    // A real domain has a dot in the host (or is localhost). Reject bare tokens.
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return undefined
    return u.origin
  } catch {
    return undefined
  }
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
  const site = siteUrl()
  if (site) return site
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

/**
 * Absolute base URL for customer-facing links (approval, tracking, portal).
 *
 * These links are opened by customers on their own devices, so they MUST point
 * at the real public site — never at NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL, which
 * is the v0/Supabase auth redirect proxy. That proxy origin resolves only for a
 * signed-in staff session (why the link "works from the CRM laptop") and errors
 * for an anonymous customer (why it "always shows an error" on their phone).
 *
 * Auth callbacks still use baseUrl() above, which intentionally prefers the proxy.
 */
export function appBaseUrl(): string {
  const clean = (v: string) => (v.startsWith("http") ? v : `https://${v}`).replace(/\/+$/, "")
  const site = siteUrl()
  if (site) return site
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  if (process.env.VERCEL_URL) return clean(process.env.VERCEL_URL)
  // Local dev only: fall back to the proxy origin, then localhost.
  const proxy = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  if (proxy) {
    try {
      return new URL(proxy).origin
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000"
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
  const next = opts.redirectPath ?? "/auth/set-password"
  // Auth action links (invite / recovery / set-password) are opened by staff and
  // customers on their OWN devices. We deliberately DO NOT use Supabase's hosted
  // /auth/v1/verify?...&redirect_to= flow, because that redirect is validated
  // against the project's Auth "Redirect URLs" allow-list; when a target isn't
  // allow-listed, Supabase silently falls back to the project Site URL (which
  // defaults to http://localhost:3000) — that was the "link opens localhost /
  // shows an error" bug. Instead we take the hashed_token that generateLink
  // returns and build our OWN link to /auth/confirm, which calls verifyOtp
  // directly. That works on any device regardless of the Supabase URL config.
  const redirectTo = `${appBaseUrl()}/auth/confirm?next=${encodeURIComponent(next)}`

  const tryType = async (type: LinkType) => {
    const { data, error } = await sb.auth.admin.generateLink({
      type: type === "magiclink" ? "magiclink" : type,
      email: opts.email,
      options: { redirectTo },
    } as Parameters<typeof sb.auth.admin.generateLink>[0])
    const props = data?.properties as
      | { hashed_token?: string; verification_type?: string; action_link?: string }
      | undefined
    const hashed = props?.hashed_token
    const verType = props?.verification_type ?? (type === "magiclink" ? "magiclink" : type)
    // Prefer our own allow-list-independent confirm link built from the token
    // hash; only fall back to the raw hosted action_link if the hash is absent.
    const link = hashed
      ? `${appBaseUrl()}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(
          verType,
        )}&next=${encodeURIComponent(next)}`
      : (props?.action_link ?? "")
    return { link, error }
  }

  let { link, error } = await tryType(opts.type)

  // Supabase's link types are mutually exclusive about account existence, and
  // which one applies isn't always knowable up front:
  //   • "invite"   only works for an email that does NOT yet exist; once the
  //                account exists it fails with "A user with this email address
  //                has already been registered".
  //   • "recovery" only works for an email that DOES exist; otherwise it fails
  //                with "User with this email not found".
  // Either failure previously left the link empty (nothing to copy/email/WA).
  // Both link types serve the same purpose here (let the person set a password),
  // so we transparently fall back to the opposite type on the tell-tale error.
  const missing = () => !link || Boolean(error)
  if (missing() && /already|registered|exist/i.test(error?.message ?? "")) {
    ;({ link, error } = await tryType("recovery"))
  }
  if (missing() && /not\s*found|no\s*user|does\s*not\s*exist/i.test(error?.message ?? "")) {
    ;({ link, error } = await tryType("invite"))
  }
  // Last resort: try whichever standard type we haven't attempted yet.
  if (missing()) {
    ;({ link, error } = await tryType("invite"))
  }
  if (missing()) {
    ;({ link, error } = await tryType("recovery"))
  }

  if (!link) {
    throw new Error(error?.message ?? "Could not generate the account link.")
  }
  return link
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
