import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { writeAudit } from "@/lib/rbac/context"
import { syncJobMonitors } from "@/lib/service-monitor"
import { confirmBackupManifest, runDatabaseBackup, type BackupOutcome } from "@/lib/database-backup"

export type HeartbeatStatus = "ok" | "partial" | "failed"

const BACKUP_JOB = "backup"

function boundedDetail(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {}
  const json = JSON.stringify(detail)
  return json.length <= 4000 ? (JSON.parse(json) as Record<string, unknown>) : { truncated: true }
}

/**
 * Records an externally reported job completion and immediately re-syncs the
 * monitors that track it. A backup heartbeat only counts as verified when its
 * manifest is confirmed in storage; a caller cannot simply claim "verified".
 */
export async function recordHeartbeat(
  job: string,
  status: HeartbeatStatus,
  rawDetail: unknown,
): Promise<{ ok: true; status: HeartbeatStatus } | { ok: false; error: string; httpStatus: number }> {
  const detail = boundedDetail(rawDetail)
  delete detail.verified
  let finalStatus = status
  if (job === BACKUP_JOB && status === "ok") {
    const confirmed = await confirmBackupManifest(detail.manifest)
    if (!confirmed.ok) return { ok: false, error: confirmed.error, httpStatus: 422 }
    detail.verified = true
  }
  if (job === BACKUP_JOB && status !== "ok") finalStatus = "failed"
  const now = new Date().toISOString()
  const { error } = await createServiceClient()
    .from("scheduled_job_runs")
    .insert({ job, status: finalStatus, started_at: now, finished_at: now, detail })
  if (error) return { ok: false, error: error.message, httpStatus: 500 }
  await syncJobMonitors(job).catch(() => {})
  return { ok: true, status: finalStatus }
}

/** Runs a full backup as a tracked job. The run only becomes "ok" once every file and the manifest are verified. */
export async function runBackupJob(trigger: "cron" | "manual"): Promise<BackupOutcome & { runId: string | null }> {
  const svc = createServiceClient()
  const { data: run } = await svc.from("scheduled_job_runs").insert({ job: BACKUP_JOB, detail: { trigger } }).select("id").single()
  let outcome: BackupOutcome
  try {
    outcome = await runDatabaseBackup()
  } catch (e) {
    outcome = {
      ok: false,
      manifestPathname: null,
      tables: 0,
      totalRows: 0,
      totalBytes: 0,
      durationMs: 0,
      failures: [{ table: "_backup", error: (e as Error).message.slice(0, 300) }],
      warnings: [],
    }
  }

  const detail = {
    trigger,
    verified: outcome.ok,
    manifest: outcome.manifestPathname,
    tables: outcome.tables,
    total_rows: outcome.totalRows,
    total_bytes: outcome.totalBytes,
    duration_ms: outcome.durationMs,
    failures: outcome.failures.slice(0, 20),
    warnings: outcome.warnings.slice(0, 20),
    ...(outcome.ok ? {} : { error: outcome.failures.map((f) => `${f.table}: ${f.error}`).join("; ").slice(0, 600) }),
  }
  await svc
    .from("scheduled_job_runs")
    .update({ status: outcome.ok ? "ok" : "failed", finished_at: new Date().toISOString(), detail })
    .eq("id", run?.id)
  await writeAudit({
    action: outcome.ok ? "database_backup_completed" : "database_backup_failed",
    resourceType: "scheduled_job",
    resourceId: run?.id ?? null,
    detail,
    status: outcome.ok ? "ok" : "error",
  })
  await syncJobMonitors(BACKUP_JOB).catch(() => {})
  return { ...outcome, runId: run?.id ?? null }
}
