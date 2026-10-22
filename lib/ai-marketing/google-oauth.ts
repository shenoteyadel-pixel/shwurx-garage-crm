import type { NextRequest } from "next/server"

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/google-ads/oauth/callback"

/** Must exactly match an "Authorized redirect URI" on the Google Cloud OAuth client. */
export function googleRedirectUri(req?: NextRequest) {
  const override = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI?.trim()
  if (override) return override
  const origin = req?.nextUrl.origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://swurxauto.com"
  return `${origin.replace(/\/$/, "")}${GOOGLE_OAUTH_CALLBACK_PATH}`
}
