import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getSessionContext } from "@/lib/rbac/context"
import { GOOGLE_ADS_SCOPE } from "@/lib/ai-marketing/google"
import { googleRedirectUri } from "@/lib/ai-marketing/google-oauth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const back = new URL("/ai-marketing/google", req.nextUrl.origin)
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isActive || ctx.role !== "owner") {
    back.searchParams.set("oauth_error", "Owner access required.")
    return NextResponse.redirect(back)
  }
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim()
  if (!clientId || !process.env.GOOGLE_ADS_CLIENT_SECRET?.trim()) {
    back.searchParams.set("oauth_error", "Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET first.")
    return NextResponse.redirect(back)
  }

  const state = randomBytes(24).toString("base64url")
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString()

  const res = NextResponse.redirect(url)
  res.cookies.set("gads_oauth_state", `${state}.${ctx.userId}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/google-ads/oauth",
    maxAge: 600,
  })
  return res
}
