import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { deploymentMode } from "@/lib/website/env"
import { isSitePath } from "@/lib/website/paths"

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
    "/pay", // tokenized customer invoice pay page (card checkout)
    "/api/approve", // legacy approval submit/decision API
    "/api/approvals", // per-item approval submit API (customer, no login)
    "/api/approval", // approval API alias
    "/api/track", // tracking open-event beacon
    "/api/public", // website ingestion: /track, /appointments, /leads (anon RPC only)
    "/api/stripe", // Stripe checkout session + webhook for invoice payments
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
    "/blog",
  ]
  if (path === "/" || path === "/sw.js" || path === "/manifest.webmanifest") return true
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
// Public website pages that exist in both languages. English is unprefixed;
// Arabic lives under /ar and is rewritten to the same page with a locale header.
const LOCALE_PROOF = "x-site-locale-proof"

function localeSecret(): string | null {
  return process.env.SITE_LOCALE_SECRET || process.env.SUPABASE_JWT_SECRET || null
}

async function signLocale(value: string): Promise<string | null> {
  const secret = localeSecret()
  if (!secret) return null
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`site-locale:${value}`))
  return Buffer.from(mac).toString("base64url")
}

/**
 * When Next resolves a locale rewrite as a separate origin it re-requests the
 * target path, so this proxy runs again on the unprefixed path. The signed proof
 * lets that second pass keep Arabic; any client-supplied locale headers are discarded.
 */
async function reenteredArabicPath(request: NextRequest): Promise<string | null> {
  const proof = request.headers.get(LOCALE_PROOF)
  const original = request.headers.get("x-site-path")
  if (!proof || !original || request.headers.get("x-site-locale") !== "ar") return null
  const expected = await signLocale(`ar:${original}:${request.nextUrl.pathname}`)
  return expected && expected === proof ? original : null
}

/** CRM requests: language comes from the saved cookie, never from client-sent site headers. */
function crmNext(request: NextRequest) {
  const headers = new Headers(request.headers)
  // Next's request override does not drop removed keys, so overwrite with inert values.
  for (const h of ["x-site-locale", "x-site-path", LOCALE_PROOF]) headers.set(h, "")
  return NextResponse.next({ request: { headers } })
}

async function withLocale(request: NextRequest, locale: "en" | "ar", originalPath = request.nextUrl.pathname, targetPath?: string) {
  const headers = new Headers(request.headers)
  headers.set(LOCALE_PROOF, "")
  headers.set("x-site-locale", locale)
  headers.set("x-site-path", originalPath)
  if (locale === "ar" && targetPath) {
    const proof = await signLocale(`ar:${originalPath}:${targetPath}`)
    if (proof) headers.set(LOCALE_PROOF, proof)
  }
  return headers
}

// Draft/revision previews are never cached or indexed; neither is any
// non-production deployment (robots.txt alone does not stop indexing).
function siteHeaders(request: NextRequest, res: NextResponse) {
  const previewing = !!request.cookies.get("shwurx_site_preview")?.value
  if (previewing) res.headers.set("Cache-Control", "private, no-store, max-age=0")
  if (previewing || deploymentMode() !== "production") res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  return res
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path === "/robots.txt" || path === "/sitemap.xml") return NextResponse.next()

  if (path === "/ar" || path.startsWith("/ar/")) {
    const rest = path.slice(3) || "/"
    const url = request.nextUrl.clone()
    // Unknown /ar/* paths must 404 rather than expose CRM routes under /ar.
    url.pathname = isSitePath(rest) ? rest : "/pages/__not-found"
    const headers = await withLocale(request, "ar", path, url.pathname)
    return siteHeaders(request, NextResponse.rewrite(url, { request: { headers } }))
  }
  if (isSitePath(path)) {
    const arabicOriginal = await reenteredArabicPath(request)
    const headers = arabicOriginal
      ? await withLocale(request, "ar", arabicOriginal, path)
      : await withLocale(request, "en")
    return siteHeaders(request, NextResponse.next({ request: { headers } }))
  }

  const isPublic = isPublicPath(path)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase env is somehow unavailable, never crash the request.
  // Allow public routes through and send everything else to login.
  if (!supabaseUrl || !supabaseKey) {
    if (isPublic) return crmNext(request)
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  let supabaseResponse = crmNext(request)

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = crmNext(request)
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
