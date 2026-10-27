import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const JOB_NAME = /^[a-z0-9][a-z0-9-]{1,48}$/

/** External jobs (database backups etc.) report completion here so freshness can be monitored. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { job?: string; status?: string; detail?: unknown }
  const job = String(body.job ?? "")
  if (!JOB_NAME.test(job)) return NextResponse.json({ error: "Invalid job name" }, { status: 400 })
  const status = body.status === "failed" ? "failed" : body.status === "partial" ? "partial" : "ok"
  const detail = body.detail && typeof body.detail === "object" ? JSON.parse(JSON.stringify(body.detail).slice(0, 4000) || "{}") : null
  const svc = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await svc.from("scheduled_job_runs").insert({ job, status, started_at: now, finished_at: now, detail })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
