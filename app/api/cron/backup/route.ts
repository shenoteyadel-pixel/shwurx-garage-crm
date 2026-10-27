import { NextResponse, type NextRequest } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { runBackupJob } from "@/lib/job-runs"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Daily verified database backup to private Blob storage. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const res = await runBackupJob("cron")
  return NextResponse.json(
    {
      ok: res.ok,
      runId: res.runId,
      manifest: res.manifestPathname,
      tables: res.tables,
      totalRows: res.totalRows,
      totalBytes: res.totalBytes,
      durationMs: res.durationMs,
      failures: res.failures,
      warnings: res.warnings,
    },
    { status: res.ok ? 200 : 500 },
  )
}
