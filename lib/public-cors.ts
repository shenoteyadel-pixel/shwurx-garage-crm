import { NextResponse } from "next/server"

/**
 * CORS for the public ingestion endpoints that the separate SHWURX marketing
 * website calls from the browser. These routes only ever WRITE through
 * SECURITY DEFINER RPCs with the anon key — no secrets and no reads — so a
 * permissive origin is acceptable. Tighten `ALLOWED_ORIGINS` to the live
 * website origin(s) once they are known.
 */
const ALLOWED_ORIGINS = (process.env.PUBLIC_WEBSITE_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)

export function corsHeaders(origin: string | null): Record<string, string> {
  // If an allow-list is configured, echo the origin only when it matches;
  // otherwise fall back to "*" (safe here because there are no credentials).
  let allow = "*"
  if (ALLOWED_ORIGINS.length > 0) {
    allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

export function preflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) })
}

export function jsonWithCors(request: Request, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(request.headers.get("origin")) })
}
