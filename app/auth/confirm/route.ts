import { NextResponse } from "next/server"

/**
 * Pass-through for auth action links (invite / recovery / set-password).
 *
 * IMPORTANT: this route deliberately does NOT call verifyOtp. Auth tokens are
 * one-time use, and email security scanners (Gmail, Outlook SafeLinks, corporate
 * antivirus proxies) PREFETCH links in emails — a background GET here would burn
 * the one-time token before the human ever clicks, which is exactly why invite /
 * recovery links were landing on /auth/error.
 *
 * Instead we forward the token_hash + type to the set-password page and verify it
 * ONLY when the person submits their new password (a form POST that scanners do
 * not trigger). See app/auth/set-password/page.tsx.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = searchParams.get("next") ?? "/auth/set-password"

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const target = new URL(next.startsWith("/") ? next : "/auth/set-password", origin)
  target.searchParams.set("token_hash", tokenHash)
  target.searchParams.set("type", type)
  return NextResponse.redirect(target)
}
