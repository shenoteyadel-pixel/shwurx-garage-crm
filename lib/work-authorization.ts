import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { isOverrideActive, WORK_SCOPE_LABELS, type WorkScope } from "@/lib/work-authorization-rules"

export type WorkAuthorizationCheck =
  | { ok: true; via: "approval" | "override" }
  | { ok: false; error: string }

/**
 * Work may start (or parts be ordered) only when the customer has approved the
 * job, or a manager has recorded an emergency authorization that is still active.
 */
export async function checkWorkAuthorization(jobId: string, scope: WorkScope): Promise<WorkAuthorizationCheck> {
  const svc = createServiceClient()
  const { data: job } = await svc.from("jobs").select("approval_status").eq("id", jobId).maybeSingle()
  if (!job) return { ok: false, error: "Job not found." }
  if (job.approval_status === "approved") return { ok: true, via: "approval" }

  const { data: overrides } = await svc
    .from("work_authorization_overrides")
    .select("scope, expires_at, revoked_at")
    .eq("job_id", jobId)
    .eq("scope", scope)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
  if ((overrides ?? []).some((o) => isOverrideActive(o, scope))) return { ok: true, via: "override" }

  return {
    ok: false,
    error: `${WORK_SCOPE_LABELS[scope]} is blocked: the customer has not approved this job. A manager can record an emergency authorization on the job card.`,
  }
}
