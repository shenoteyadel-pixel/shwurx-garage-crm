import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { recordHeartbeat } from "@/lib/job-runs"

export const dynamic = "force-dynamic"

const JOB_NAME = /^[a-z0-9][a-z0-9-]{1,48}$/

/**
 * External jobs report completion here so freshness can be monitored. A "backup"
 * heartbeat is only accepted as ok when its detail.manifest points at a verified
 * backup manifest that exists in storage.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { job?: string; status?: string; detail?: unknown }
  const job = String(body.job ?? "")
  if (!JOB_NAME.test(job)) return NextResponse.json({ error: "Invalid job name" }, { status: 400 })
  const status = body.status === "failed" ? "failed" : body.status === "partial" ? "partial" : "ok"
  const res = await recordHeartbeat(job, status, body.detail)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.httpStatus })
  return NextResponse.json({ ok: true, status: res.status })
}
