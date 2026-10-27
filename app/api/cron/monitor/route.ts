import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runServiceChecks } from "@/lib/service-monitor"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Full service check pass. Scheduled every 15 minutes by Vercel Cron (vercel.json). */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await runServiceChecks())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
