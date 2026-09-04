import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Routes that must be reachable WITHOUT staff authentication.
//
// These are the customer-facing surfaces. A customer must NEVER be bounced to
// the staff sign-in page from any of them. Two distinct kinds live here:
//   1. Tokenized links (NO login of any kind): /track, /approve, /approval,
//      /customer-access, and their API endpoints. Security is the opaque token,
//      validated server-side — not a session.
//   2. The customer portal (/portal), which manages its own customer login at
//      /portal/login and renders its own landing when signed out. It must not
//      be intercepted by the staff-login redirect.
function isPublicPath(path: string): boolean {
  // Tokenized, no-login customer surfaces.
  const tokenizedPrefixes = [
    "/track", // secure vehicle tracking link
    "/approve", // customer quotation approval (per-item + legacy)
    "/approval", // spec alias for approval links
    "/customer-access", // spec alias for customer access links
    "/api/approve", // approval submit/decision API (approve + approvals)
    "/api/track", // tracking open-event beacon
    "/api/public", // website ingestion: /track, /appointments, /leads (anon RPC only)
  ]
  for (const prefix of tokenizedPrefixes) {
    if (path === prefix || path.startsWith(prefix + "/")) return true
  }

  // Public marketing website (SHWURX.com). These live at the root and must be
  // reachable by anyone — logged out OR logged in — without ever redirecting to
  // the staff dashboard. The CRM now lives under /crm (still protected).
  const publicSitePrefixes = [
    "/services",
    "/about",
    "/appointment",
    "/contact",
  ]
  if (path === "/") return true
  for (const prefix of publicSitePrefixes) {
    if (path === prefix || path.startsWith(prefix + "/")) return true
  }

  return (
    path === "/auth" ||
    path.startsWith("/auth/") || // staff login, set-password, callback, error
    path === "/portal" ||
    path.startsWith("/portal/") || // customer portal + /portal/login + /portal/t/<token>
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico"
  )
}

// Next.js 16 Proxy (formerly Middleware). Runs on the Node.js runtime by
// default, so Node globals and heavier deps (@supabase/ssr) are fully supported.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isPublic = isPublicPath(path)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase env is somehow unavailable, never crash the request.
  // Allow public routes through and send everything else to login.
  if (!supabaseUrl || !supabaseKey) {
    if (isPublic) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    // A transient auth/network error must never produce a 500 in production.
    console.log("[v0] proxy auth check failed:", (error as Error)?.message)
    if (isPublic) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
