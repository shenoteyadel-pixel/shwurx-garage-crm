"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { notifyByPermission } from "@/lib/actions-notifications"
import { validateOverrideReason, WORK_SCOPE_LABELS, type WorkScope } from "@/lib/work-authorization-rules"

type Result = { ok: true } | { ok: false; error: string }

export async function createWorkOverride(input: {
  jobId: string
  scope: WorkScope
  reason: string
  customerContact?: string
}): Promise<Result> {
  const ctx = await requirePermission("jobs.assign")
  if (!(input.scope in WORK_SCOPE_LABELS)) return { ok: false, error: "Choose what you are authorizing." }
  const reasonError = validateOverrideReason(input.reason)
  if (reasonError) return { ok: false, error: reasonError }

  const svc = createServiceClient()
  const { data: job } = await svc
    .from("jobs")
    .select("id, job_number, approval_status")
    .eq("id", input.jobId)
    .maybeSingle()
  if (!job) return { ok: false, error: "Job not found." }
  if (job.approval_status === "approved") {
    return { ok: false, error: "The customer has already approved this job, so no emergency authorization is needed." }
  }

  const { data: row, error } = await svc
    .from("work_authorization_overrides")
    .insert({
      job_id: input.jobId,
      scope: input.scope,
      reason: input.reason.trim(),
      customer_contact: input.customerContact?.trim().slice(0, 300) || null,
      authorized_by: ctx.userId,
      authorized_by_name: ctx.name,
    })
    .select("id, expires_at")
    .single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, "work_override.create", "work_authorization_overrides", row.id, {
    job_id: input.jobId,
    scope: input.scope,
    expires_at: row.expires_at,
  })
  await notifyByPermission("settings.manage", {
    title: `Emergency authorization: ${WORK_SCOPE_LABELS[input.scope]}`,
    body: `Job ${job.job_number ?? ""}: ${ctx.name} authorized without customer approval for 24h. Reason: ${input.reason.trim().slice(0, 140)}`,
    type: "approval",
    link: `/jobs/${input.jobId}`,
  })
  revalidatePath(`/jobs/${input.jobId}`)
  return { ok: true }
}

export async function revokeWorkOverride(overrideId: string): Promise<Result> {
  const ctx = await requirePermission("jobs.assign")
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("work_authorization_overrides")
    .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
    .eq("id", overrideId)
    .is("revoked_at", null)
    .select("job_id")
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: "This authorization is already revoked." }
  await logAction(ctx, "work_override.revoke", "work_authorization_overrides", overrideId, { job_id: data.job_id })
  revalidatePath(`/jobs/${data.job_id}`)
  return { ok: true }
}
