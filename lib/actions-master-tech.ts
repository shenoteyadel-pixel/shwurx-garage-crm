"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAnyPermission, requireSession, ctxCan, logAction } from "@/lib/rbac/context"
import { notifyUserIds } from "@/lib/job-notify"
import { MASTER_ELIGIBLE_ROLES, assertTaskLead } from "@/lib/master-tech"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : ""
  return { ok: false, error: message || fallback }
}

async function loadJob(jobId: string) {
  const svc = createServiceClient()
  const { data } = await svc
    .from("jobs")
    .select("id, job_number, stage, advisor_id, technician_id, master_technician_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle()
  if (!data || data.deleted_at) throw new Error("Job not found.")
  return { svc, job: data }
}

async function assertEligibleTechnician(svc: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await svc.from("profiles").select("id, full_name, role, is_active").eq("id", userId).maybeSingle()
  if (!data || !data.is_active || !MASTER_ELIGIBLE_ROLES.includes(data.role)) {
    throw new Error("Choose an active technician.")
  }
  return data
}

/**
 * Sets or changes the Master Technician of a job card. The advisor of the job
 * and workshop supervisors can assign; changing someone else's choice needs a
 * reason, and only managers holding jobs.override_master may override.
 */
export async function assignMasterTechnician(jobId: string, technicianId: string, reason: string): Promise<Result> {
  try {
    const ctx = await requireAnyPermission(["jobs.assign_master", "jobs.override_master"])
    const { svc, job } = await loadJob(jobId)
    if (job.stage === "delivered") return { ok: false, error: "This job is already delivered." }
    if (job.master_technician_id === technicianId) return { ok: true }

    const canOverride = ctxCan(ctx, "jobs.override_master")
    const ownsJob = job.advisor_id === ctx.userId || ctxCan(ctx, "jobs.assign")
    const isReassign = Boolean(job.master_technician_id)
    if (!ownsJob && !canOverride) {
      return { ok: false, error: "Only the job's service advisor or a workshop manager can change the Master Technician." }
    }
    const cleanReason = reason.trim().slice(0, 500)
    if (isReassign && cleanReason.length < 5) return { ok: false, error: "Give a reason for the reassignment (at least 5 characters)." }

    const target = await assertEligibleTechnician(svc, technicianId)
    const now = new Date().toISOString()
    // The Master Technician is the job's lead technician, which is what job access is based on.
    const leadFollowsMaster = !job.technician_id || job.technician_id === job.master_technician_id
    const { error } = await svc
      .from("jobs")
      .update({
        master_technician_id: technicianId,
        master_assigned_at: now,
        master_assigned_by: ctx.userId,
        ...(leadFollowsMaster ? { technician_id: technicianId } : {}),
        updated_at: now,
      })
      .eq("id", jobId)
    if (error) return fail(error, "Could not assign the Master Technician.")

    const isOverride = isReassign && canOverride && !ownsJob
    await svc.from("job_master_assignments").insert({
      job_id: jobId,
      from_technician_id: job.master_technician_id,
      to_technician_id: technicianId,
      reason: cleanReason || null,
      is_override: isOverride,
      actor_id: ctx.userId,
    })

    await notifyUserIds([technicianId], {
      title: `You are Master Technician on job ${job.job_number ?? ""}`,
      body: `Assigned by ${ctx.name}. Split the work into tasks for your team.`,
      type: "job",
      link: "/master",
    })
    if (job.master_technician_id) {
      await notifyUserIds([job.master_technician_id], {
        title: `Job ${job.job_number ?? ""} was reassigned`,
        body: `${target.full_name ?? "Another technician"} is now Master Technician. Reason: ${cleanReason}`,
        type: "job",
        link: `/jobs/${jobId}`,
      })
    }
    await logAction(ctx, isOverride ? "job.master_override" : "job.master_assign", "job", jobId, {
      from: job.master_technician_id,
      to: technicianId,
      reason: cleanReason || null,
    })
    revalidatePath(`/jobs/${jobId}`)
    revalidatePath("/master")
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not assign the Master Technician.")
  }
}

/** Moves a task to another technician. The clock stops and both people are told. */
export async function reassignTask(taskId: string, technicianId: string, reason: string): Promise<Result> {
  try {
    const ctx = await requireAnyPermission(["jobs.assign", "tasks.assign"])
    const svc = createServiceClient()
    const { data: task } = await svc
      .from("technician_tasks")
      .select("id, job_id, technician_id, title, status, timer_started_at, worked_seconds")
      .eq("id", taskId)
      .maybeSingle()
    if (!task) return { ok: false, error: "Task not found." }
    const { job } = await loadJob(task.job_id)
    await assertTaskLead(ctx, job.master_technician_id)
    if (task.technician_id === technicianId) return { ok: true }
    if (task.status === "qc_approved") return { ok: false, error: "Approved work can't be reassigned." }
    const cleanReason = reason.trim().slice(0, 500)
    if (cleanReason.length < 5) return { ok: false, error: "Give a reason for the reassignment (at least 5 characters)." }
    await assertEligibleTechnician(svc, technicianId)

    const elapsed = task.timer_started_at ? Math.max(0, Math.round((Date.now() - new Date(task.timer_started_at).getTime()) / 1000)) : 0
    const { error } = await svc
      .from("technician_tasks")
      .update({
        technician_id: technicianId,
        timer_started_at: null,
        worked_seconds: (task.worked_seconds ?? 0) + elapsed,
        status: task.status === "in_progress" || task.status === "inspection" ? "assigned" : task.status,
        assigned_by: ctx.userId,
      })
      .eq("id", taskId)
    if (error) return fail(error, "Could not reassign the task.")

    await notifyUserIds([technicianId], {
      title: `Task assigned to you: ${task.title}`,
      body: `Job ${job.job_number ?? ""} · by ${ctx.name}`,
      type: "job",
      link: `/technician/tasks/${taskId}`,
    })
    await notifyUserIds([task.technician_id], {
      title: `Task moved: ${task.title}`,
      body: `Reassigned by ${ctx.name}. Reason: ${cleanReason}`,
      type: "job",
      link: "/technician",
    })
    await logAction(ctx, "technician_task.reassign", "technician_task", taskId, { from: task.technician_id, to: technicianId, reason: cleanReason })
    revalidatePath(`/jobs/${task.job_id}`)
    revalidatePath("/master")
    revalidatePath("/technician")
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not reassign the task.")
  }
}

/** Records why a task is running late. The technician on the task or its lead can set it. */
export async function setTaskDelayReason(taskId: string, reason: string): Promise<Result> {
  try {
    const ctx = await requireSession()
    const svc = createServiceClient()
    const { data: task } = await svc.from("technician_tasks").select("id, job_id, technician_id, title").eq("id", taskId).maybeSingle()
    if (!task) return { ok: false, error: "Task not found." }
    const { job } = await loadJob(task.job_id)
    if (task.technician_id !== ctx.userId) await assertTaskLead(ctx, job.master_technician_id)
    const clean = reason.trim().slice(0, 500)
    const { error } = await svc.from("technician_tasks").update({ delay_reason: clean || null }).eq("id", taskId)
    if (error) return fail(error, "Could not save the delay reason.")
    if (clean && job.master_technician_id && job.master_technician_id !== ctx.userId) {
      await notifyUserIds([job.master_technician_id], {
        title: `Delay reported: ${task.title}`,
        body: `${ctx.name}: ${clean}`,
        type: "job",
        link: "/master",
      })
    }
    revalidatePath(`/technician/tasks/${taskId}`)
    revalidatePath("/master")
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not save the delay reason.")
  }
}
