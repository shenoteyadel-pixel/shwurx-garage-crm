import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/** Public uptime probe for external monitors. Reports only up/down, never data. */
export async function GET() {
  const started = Date.now()
  let database = false
  try {
    const svc = createServiceClient()
    const { error } = await svc.from("profiles").select("id", { head: true, count: "exact" }).limit(1)
    database = !error
  } catch {
    database = false
  }
  return NextResponse.json(
    { status: database ? "ok" : "degraded", database: database ? "up" : "down", ms: Date.now() - started },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  )
}
