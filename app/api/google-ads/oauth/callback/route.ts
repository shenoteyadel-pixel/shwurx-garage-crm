import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getSessionContext, logAction } from "@/lib/rbac/context"
import { createClient } from "@/lib/supabase/server"
import { storeRefreshToken } from "@/lib/ai-marketing/google-token"
import { googleRedirectUri } from "@/lib/ai-marketing/google-oauth"
import { runGoogleSync } from "@/lib/ai-marketing/google-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function GET(req: NextRequest) {
  const back = new URL("/ai-marketing/google", req.nextUrl.origin)
  const fail = (msg: string) => {
    back.searchParams.set("oauth_error", msg.slice(0, 300))
    const res = NextResponse.redirect(back)
    res.cookies.delete({ name: "gads_oauth_state", path: "/api/google-ads/oauth" })
    return res
  }

  const ctx = await getSessionContext()
  if (!ctx || !ctx.isActive || ctx.role !== "owner") return fail("Owner access required.")

  const q = req.nextUrl.searchParams
  if (q.get("error")) return fail(`Google declined authorization: ${q.get("error")}`)
  const code = q.get("code")
  const state = q.get("state") ?? ""
  const [cookieState, cookieUser] = (req.cookies.get("gads_oauth_state")?.value ?? "").split(".")
  if (!code || !cookieState || !same(state, cookieState) || cookieUser !== ctx.userId) {
    return fail("Authorization state mismatch or expired. Start again.")
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(req),
    }),
    cache: "no-store",
  }).catch(() => null)
  if (!tokenRes) return fail("Could not reach oauth2.googleapis.com.")
  const json = (await tokenRes.json().catch(() => ({}))) as {
    refresh_token?: string
    scope?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok) return fail(`Token exchange failed: ${json.error_description ?? json.error ?? tokenRes.status}`)
  if (!json.refresh_token) {
    return fail("Google returned no refresh token. Remove the app's access at myaccount.google.com/permissions and authorize again.")
  }
  if (!json.scope?.includes("adwords")) return fail("The Google Ads (adwords) scope was not granted.")

  try {
    await storeRefreshToken(json.refresh_token, json.scope ?? null, { id: ctx.userId, name: ctx.name })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not store authorization.")
  }
  await logAction(ctx, "google_ads.oauth_authorized", "google_ads_oauth", "1", { scope: json.scope })

  // Only a real API call decides whether we show "Connected".
  const supabase = await createClient()
  const sync = await runGoogleSync(supabase, "manual", { id: ctx.userId, name: ctx.name })
  back.searchParams.set(sync.ok ? "oauth" : "oauth_error", sync.ok ? "ok" : `Authorized, but the API test failed: ${sync.summary}`.slice(0, 300))
  const res = NextResponse.redirect(back)
  res.cookies.delete({ name: "gads_oauth_state", path: "/api/google-ads/oauth" })
  return res
}
