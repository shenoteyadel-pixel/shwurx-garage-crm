"use server"

import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/rbac/context"
import { requireJobWork } from "@/lib/rbac/job-access"
import { normalizeChecklist, type JobType } from "@/lib/full-inspection-config"

async function guard(jobId: string) {
  if (!jobId) throw new Error("Missing job")
  return requireJobWork(["jobs.edit", "inspection.manage"], jobId)
}

export async function saveFullInspection(input: {
  jobId: string
  checklist: unknown
  summary?: string | null
  recommendations?: string | null
  odometer?: number | null
  complete?: boolean
}) {
  const { supabase, ctx } = await guard(input.jobId)

  const checklist = normalizeChecklist(input.checklist)
  const odometer =
    typeof input.odometer === "number" && Number.isFinite(input.odometer) && input.odometer >= 0
      ? Math.round(Math.min(input.odometer, 2_000_000))
      : null
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    checklist,
    summary: input.summary?.trim().slice(0, 4000) || null,
    recommendations: input.recommendations?.trim().slice(0, 4000) || null,
    odometer,
    updated_at: now,
  }
  if (input.complete !== undefined) {
    patch.status = input.complete ? "completed" : "in_progress"
    patch.completed_at = input.complete ? now : null
  }

  const { data: existing } = await supabase
    .from("vehicle_inspections")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("inspection_type", "full")
    .maybeSingle()

  const { error } = existing
    ? await supabase.from("vehicle_inspections").update(patch).eq("id", existing.id)
    : await supabase
        .from("vehicle_inspections")
        .insert({ ...patch, job_id: input.jobId, inspection_type: "full", created_by: ctx.userId })
  if (error) throw new Error(error.message)

  await logAction(ctx, input.complete ? "full_inspection_completed" : "full_inspection_saved", "job", input.jobId)
  revalidatePath(`/jobs/${input.jobId}`)
}

export async function setJobType(jobId: string, jobType: JobType) {
  if (jobType !== "repair" && jobType !== "inspection_only") throw new Error("Invalid job type")
  const { supabase, ctx } = await requireJobWork(["jobs.edit", "jobs.update_status"], jobId)
  const { error } = await supabase.from("jobs").update({ job_type: jobType }).eq("id", jobId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "job_type_set", "job", jobId, { jobType })
  revalidatePath(`/jobs/${jobId}`)
}
