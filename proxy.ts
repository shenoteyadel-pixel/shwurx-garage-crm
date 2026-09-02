import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Routes that must be reachable WITHOUT authentication.
function isPublicPath(path: string): boolean {
  return (
    path.startsWith("/auth") || // login, set-password, callback, error
    path.startsWith("/approve") || // customer quotation approval
    path.startsWith("/api/approve") ||
    path.startsWith("/portal/t/") || // public customer job-tracking links
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
