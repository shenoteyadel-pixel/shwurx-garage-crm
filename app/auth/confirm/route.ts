import { createClient } from "@/lib/supabase/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

/**
 * Verifies a Supabase auth action token WITHOUT relying on Supabase's hosted
 * /auth/v1/verify?...&redirect_to= flow.
 *
 * The hosted flow only redirects to a `redirect_to` that is present in the
 * project's Auth "Redirect URLs" allow-list; when it isn't, Supabase silently
 * falls back to the project Site URL (which defaults to http://localhost:3000),
 * which is why invite / recovery links "gave an error" or opened localhost.
 *
 * Instead, account-links.ts builds links that point here with the
 * `hashed_token` returned by admin.generateLink, and we exchange it for a
 * session directly with verifyOtp. This makes the links work on any device
 * regardless of the Supabase allow-list / Site URL configuration.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/"

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
