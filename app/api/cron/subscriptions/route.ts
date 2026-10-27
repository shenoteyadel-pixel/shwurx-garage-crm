import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { ReminderRunInProgressError, runSubscriptionReminders } from "@/lib/subscription-reminders"
import { runServiceChecks } from "@/lib/service-monitor"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Daily: renewal reminders (with retries), then a full service check pass. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const out: Record<string, unknown> = {}
  try {
    out.reminders = await runSubscriptionReminders()
  } catch (e) {
    if (e instanceof ReminderRunInProgressError) out.remindersSkipped = e.message
    else out.remindersError = (e as Error).message
  }
  try {
    out.monitor = await runServiceChecks()
  } catch (e) {
    out.monitorError = (e as Error).message
  }
  const failed = Boolean(out.remindersError || out.monitorError)
  return NextResponse.json(out, { status: failed ? 500 : 200 })
}
