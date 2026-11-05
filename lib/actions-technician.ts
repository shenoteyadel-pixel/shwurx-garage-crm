"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { put } from "@vercel/blob"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { requireSession, requirePermission, ctxCan, logAction } from "@/lib/rbac/context"
import { notifyJobAdvisor, notifyPermissionHolders, notifyPurchasers, notifyUserIds } from "@/lib/job-notify"
import {
  DEFAULT_CHECKLIST,
  PART_CATEGORIES,
  PART_URGENCIES,
  TASK_PRIORITIES,
  TECH_STATUSES,
  statusLabel,
  type ChecklistItem,
  type MediaPhase,
  type TaskStatus,
} from "@/lib/technician-tasks"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max) || null

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : ""
  return { ok: false, error: message || fallback }
}

function refresh(taskId: string, jobId: string) {
  revalidatePath("/technician")
  revalidatePath(`/technician/tasks/${taskId}`)
  revalidatePath(`/jobs/${jobId}`)
}

async function loadTask(taskId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("technician_tasks")
    .select("id, job_id, technician_id, title, status, timer_started_at, worked_seconds")
    .eq("id", taskId)
    .maybeSingle()
  if (error || !data) throw new Error("Task not found or you do not have access to it.")
  return { supabase, task: data }
}

/* ---------------- Assignment (workshop manager) ---------------- */

export async function assignTechnicianTask(jobId: string, formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const ctx = await requirePermission("jobs.assign")
    const technicianId = String(formData.get("technician_id") ?? "")
    const title = text(formData.get("title"), 200)
    if (!technicianId) return { ok: false, error: "Choose a technician." }
    if (!title) return { ok: false, error: "Describe the task." }
    const priority = String(formData.get("priority") ?? "normal")
    const deadlineRaw = text(formData.get("deadline"), 40)
    const deadline = deadlineRaw ? new Date(deadlineRaw) : null
    if (deadline && Number.isNaN(deadline.getTime())) return { ok: false, error: "Deadline is not a valid date." }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("technician_tasks")
      .insert({
        job_id: jobId,
        technician_id: technicianId,
        title,
        description: text(formData.get("description"), 4000),
        trade: text(formData.get("trade"), 40),
        priority: TASK_PRIORITIES.some((p) => p.value === priority) ? priority : "normal",
        deadline: deadline?.toISOString() ?? null,
        checklist: DEFAULT_CHECKLIST,
      })
      .select("id")
      .single()
    if (error) return fail(error, "Could not assign the task.")

    const { data: job } = await supabase.from("jobs").select("job_number").eq("id", jobId).maybeSingle()
    await notifyUserIds([technicianId], {
      title: `New task: ${title}`,
      body: `Job ${job?.job_number ?? ""}${deadline ? ` · due ${deadline.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}`,
      type: "job",
      link: `/technician/tasks/${data.id}`,
    })
    await logAction(ctx, "technician_task.assign", "technician_task", data.id, { job_id: jobId, technician_id: technicianId })
    refresh(data.id, jobId)
    return { ok: true, id: data.id }
  } catch (e) {
    return fail(e, "Could not assign the task.")
  }
}

/* ---------------- Clock + status (technician) ---------------- */

export async function startTaskTimer(taskId: string): Promise<Result> {
  try {
    await requireSession()
    const { supabase, task } = await loadTask(taskId)
    if (task.timer_started_at) return { ok: true }
    const status: TaskStatus = task.status === "assigned" || task.status === "qc_rejected" || task.status === "waiting_parts" || task.status === "waiting_approval" ? "in_progress" : task.status
    const { error } = await supabase
      .from("technician_tasks")
      .update({ timer_started_at: new Date().toISOString(), status })
      .eq("id", taskId)
    if (error) return fail(error, "Could not start the clock.")
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not start the clock.")
  }
}

export async function pauseTaskTimer(taskId: string): Promise<Result> {
  try {
    await requireSession()
    const { supabase, task } = await loadTask(taskId)
    if (!task.timer_started_at) return { ok: true }
    const { error } = await supabase.from("technician_tasks").update({ timer_started_at: null }).eq("id", taskId)
    if (error) return fail(error, "Could not pause the clock.")
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not pause the clock.")
  }
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<Result> {
  try {
    const ctx = await requireSession()
    if (!TECH_STATUSES.includes(status)) return { ok: false, error: "Status change not allowed." }
    const { supabase, task } = await loadTask(taskId)
    // Waiting or finished work stops the clock so idle time is never billed.
    const stopsClock = status !== "in_progress" && status !== "inspection"
    const { error } = await supabase
      .from("technician_tasks")
      .update({ status, ...(stopsClock ? { timer_started_at: null } : {}) })
      .eq("id", taskId)
    if (error) return fail(error, "Could not update the status.")

    const label = statusLabel(status)
    if (status === "waiting_approval" || status === "repair_completed") {
      await notifyJobAdvisor(task.job_id, (job) => ({
        title: `${label}: ${task.title}`,
        body: `Job ${job} · ${ctx.name}`,
        type: "job",
        link: `/jobs/${task.job_id}`,
      }))
    }
    if (status === "repair_completed") {
      await notifyPermissionHolders(["jobs.assign"], {
        title: `Repair completed: ${task.title}`,
        body: `${ctx.name} finished this task. It is ready for QC once submitted.`,
        type: "job",
        link: `/technician/tasks/${taskId}`,
      }, ctx.userId)
    }
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not update the status.")
  }
}

export async function submitTaskForQc(taskId: string): Promise<Result> {
  try {
    const ctx = await requireSession()
    const { supabase, task } = await loadTask(taskId)
    const { count } = await supabase
      .from("technical_reports")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId)
    if (!count) return { ok: false, error: "Submit a technical report before sending the work to QC." }
    const { error } = await supabase
      .from("technician_tasks")
      .update({ status: "qc_pending", timer_started_at: null })
      .eq("id", taskId)
    if (error) return fail(error, "Could not submit for QC.")
    await notifyPermissionHolders(["jobs.qc_approve"], {
      title: `QC needed: ${task.title}`,
      body: `${ctx.name} submitted this work for quality control.`,
      type: "job",
      link: `/technician/tasks/${taskId}`,
    }, ctx.userId)
    await logAction(ctx, "technician_task.submit_qc", "technician_task", taskId)
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not submit for QC.")
  }
}

export async function decideTaskQc(taskId: string, approve: boolean, note: string): Promise<Result> {
  try {
    const ctx = await requirePermission("jobs.qc_approve")
    const cleanNote = note.trim().slice(0, 2000)
    if (!approve && !cleanNote) return { ok: false, error: "Explain what needs rework." }
    const { supabase, task } = await loadTask(taskId)
    if (task.technician_id === ctx.userId) return { ok: false, error: "You cannot QC your own work." }
    const { error } = await supabase
      .from("technician_tasks")
      .update({ status: approve ? "qc_approved" : "qc_rejected", qc_note: cleanNote || null, timer_started_at: null })
      .eq("id", taskId)
    if (error) return fail(error, "Could not record the QC decision.")
    await notifyUserIds([task.technician_id], {
      title: approve ? `QC approved: ${task.title}` : `Rework required: ${task.title}`,
      body: cleanNote || `Checked by ${ctx.name}`,
      type: "job",
      link: `/technician/tasks/${taskId}`,
    })
    await logAction(ctx, approve ? "technician_task.qc_approve" : "technician_task.qc_reject", "technician_task", taskId, { note: cleanNote })
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not record the QC decision.")
  }
}

/* ---------------- Notes + checklist ---------------- */

export async function saveTaskNotes(
  taskId: string,
  input: { checklist: ChecklistItem[]; findings: string; fault_codes: string; comments: string; recommendations: string },
): Promise<Result> {
  try {
    await requireSession()
    const { supabase, task } = await loadTask(taskId)
    const checklist = (Array.isArray(input.checklist) ? input.checklist : []).slice(0, 60).map((c) => ({
      label: String(c.label ?? "").trim().slice(0, 120),
      result: c.result === "ok" || c.result === "attention" || c.result === "fail" ? c.result : null,
      note: String(c.note ?? "").trim().slice(0, 300) || undefined,
    })).filter((c) => c.label)
    const { error } = await supabase
      .from("technician_tasks")
      .update({
        checklist,
        findings: input.findings.trim().slice(0, 4000) || null,
        fault_codes: input.fault_codes.trim().slice(0, 1000) || null,
        comments: input.comments.trim().slice(0, 4000) || null,
        recommendations: input.recommendations.trim().slice(0, 4000) || null,
      })
      .eq("id", taskId)
    if (error) return fail(error, "Could not save your notes.")
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not save your notes.")
  }
}

/* ---------------- Technical report ---------------- */

const REPORT_FIELDS = [
  "complaint",
  "diagnosis",
  "fault_codes",
  "measurements",
  "root_cause",
  "recommended_repair",
  "work_performed",
  "additional_defects",
] as const

export async function submitTechnicalReport(taskId: string, formData: FormData): Promise<Result> {
  try {
    const ctx = await requireSession()
    const { supabase, task } = await loadTask(taskId)
    const row: Record<string, string | null> = {}
    for (const f of REPORT_FIELDS) row[f] = text(formData.get(f), 4000)
    if (!row.diagnosis && !row.work_performed) return { ok: false, error: "Add at least a diagnosis or the work performed." }
    const { data: job } = await supabase.from("jobs").select("vehicle_id").eq("id", task.job_id).maybeSingle()
    const { error } = await supabase.from("technical_reports").insert({
      ...row,
      job_id: task.job_id,
      task_id: taskId,
      vehicle_id: job?.vehicle_id ?? null,
      technician_id: ctx.userId,
    })
    if (error) return fail(error, "Could not save the report.")
    await supabase.from("technician_task_events").insert({
      task_id: taskId,
      job_id: task.job_id,
      actor_id: ctx.userId,
      event: "report",
      detail: { diagnosis: row.diagnosis?.slice(0, 140) ?? null },
    })
    const extra = row.additional_defects ? " Additional defects were found." : ""
    await notifyJobAdvisor(task.job_id, (label) => ({
      title: `Technical report: ${task.title}`,
      body: `Job ${label} · ${ctx.name}.${extra}`,
      type: "job",
      link: `/jobs/${task.job_id}`,
    }))
    await notifyPermissionHolders(["jobs.assign"], {
      title: `Technical report submitted`,
      body: `${ctx.name} · ${task.title}.${extra}`,
      type: "job",
      link: `/technician/tasks/${taskId}`,
    }, ctx.userId)
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not save the report.")
  }
}

/* ---------------- Parts request ---------------- */

export async function requestTaskPart(taskId: string, formData: FormData): Promise<Result> {
  try {
    const ctx = await requireSession()
    if (!ctxCan(ctx, "parts.request") && !ctxCan(ctx, "jobs.update_status")) {
      return { ok: false, error: "You do not have permission to request parts." }
    }
    const { supabase, task } = await loadTask(taskId)
    const partName = text(formData.get("part_name"), 200)
    if (!partName) return { ok: false, error: "Enter the part name." }
    const quantity = Math.trunc(Number(formData.get("quantity") ?? 1))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return { ok: false, error: "Quantity must be 1–999." }
    const category = String(formData.get("category") ?? "")
    const urgency = String(formData.get("urgency") ?? "normal")

    let photoUrl: string | null = null
    const photo = formData.get("photo")
    if (photo instanceof File && photo.size > 0) {
      photoUrl = await storePrivateMedia(task.job_id, photo, "image")
    }

    const { error } = await supabase.from("parts_requests").insert({
      job_id: task.job_id,
      task_id: taskId,
      part_name: partName,
      quantity,
      oem_number: text(formData.get("oem_number"), 80),
      category: PART_CATEGORIES.some((c) => c.value === category) ? category : null,
      urgency: PART_URGENCIES.some((u) => u.value === urgency) ? urgency : "normal",
      technical_note: text(formData.get("technical_note"), 1000),
      photo_url: photoUrl,
      requested_by: ctx.userId,
      status: "required",
    })
    if (error) return fail(error, "Could not send the request.")

    if (task.status === "in_progress" || task.status === "inspection") {
      await supabase.from("technician_tasks").update({ status: "waiting_parts", timer_started_at: null }).eq("id", taskId)
    }
    const urgent = urgency === "critical" || urgency === "high"
    const { data: job } = await supabase.from("jobs").select("job_number").eq("id", task.job_id).maybeSingle()
    const payload = {
      title: `${urgent ? "Urgent part" : "Part requested"}: ${partName} × ${quantity}`,
      body: `Job ${job?.job_number ?? ""} · ${ctx.name}`,
      type: urgent ? "warning" : "info",
      link: `/jobs/${task.job_id}`,
    }
    await notifyPurchasers(payload)
    await notifyJobAdvisor(task.job_id, () => payload)
    await notifyPermissionHolders(["jobs.assign"], payload, ctx.userId)
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not send the request.")
  }
}

/* ---------------- Media ---------------- */

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_VIDEO = 11 * 1024 * 1024

async function storePrivateMedia(jobId: string, file: File, expect: "image" | "video" | "any") {
  const isImage = file.type.startsWith("image/")
  const isVideo = file.type.startsWith("video/")
  if (!isImage && !isVideo) throw new Error("Only photos and videos can be uploaded.")
  if (expect === "image" && !isImage) throw new Error("Attach a photo.")
  if (isImage && file.size > MAX_IMAGE) throw new Error("Photo is too large (max 8 MB).")
  if (isVideo && file.size > MAX_VIDEO) throw new Error("Video is too large (max 11 MB). Record a shorter clip.")
  const id = randomUUID()
  const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
  const pathname = `technician-media/${jobId}/${id}.${ext}`
  await put(pathname, file, { access: "private", contentType: file.type, addRandomSuffix: false })
  return `/api/technician-media?p=${encodeURIComponent(pathname)}`
}

export async function uploadTaskMedia(taskId: string, formData: FormData): Promise<Result> {
  try {
    const ctx = await requireSession()
    const { supabase, task } = await loadTask(taskId)
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo or video." }
    const phaseRaw = String(formData.get("phase") ?? "during")
    const phase: MediaPhase = phaseRaw === "before" || phaseRaw === "after" ? phaseRaw : "during"
    const url = await storePrivateMedia(task.job_id, file, "any")
    const { error } = await supabase.from("vehicle_photos").insert({
      job_id: task.job_id,
      task_id: taskId,
      url,
      kind: phase === "during" ? "problem" : phase,
      phase,
      media_type: file.type.startsWith("video/") ? "video" : "image",
      caption: text(formData.get("caption"), 300),
      uploaded_by: ctx.userId,
    })
    if (error) return fail(error, "Could not save the upload.")
    refresh(taskId, task.job_id)
    return { ok: true }
  } catch (e) {
    return fail(e, "Could not upload the file.")
  }
}

/** Task list for managers assigning work (service client: profile directory only). */
export async function listAssignableTechnicians() {
  await requirePermission("jobs.assign")
  const svc = createServiceClient()
  const { data } = await svc
    .from("profiles")
    .select("id, full_name, job_title, role")
    .eq("is_active", true)
    .in("role", ["technician", "workshop_supervisor", "washing"])
    .order("full_name")
  return data ?? []
}
