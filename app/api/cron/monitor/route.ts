import { NextResponse, type NextRequest } from "next/server"
import { runServiceChecks } from "@/lib/service-monitor"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Service checks only. Call this from an external scheduler (e.g. every 5-15
 * minutes) with "Authorization: Bearer CRON_SECRET" for faster detection.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runServiceChecks())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
