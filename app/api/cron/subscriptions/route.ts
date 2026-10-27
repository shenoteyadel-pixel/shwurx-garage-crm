import { NextResponse, type NextRequest } from "next/server"
import { runSubscriptionReminders } from "@/lib/subscription-reminders"
import { runServiceChecks } from "@/lib/service-monitor"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Daily: renewal reminders (with retries), then a full service check pass. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const out: Record<string, unknown> = {}
  try {
    out.reminders = await runSubscriptionReminders()
  } catch (e) {
    out.remindersError = (e as Error).message
  }
  try {
    out.monitor = await runServiceChecks()
  } catch (e) {
    out.monitorError = (e as Error).message
  }
  const failed = Boolean(out.remindersError || out.monitorError)
  return NextResponse.json(out, { status: failed ? 500 : 200 })
}
