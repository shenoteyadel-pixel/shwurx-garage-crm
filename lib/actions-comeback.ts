"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { notifyUser } from "@/lib/actions-notifications"
import { isComebackResponsibility, comebackResponsibilityLabel } from "@/lib/comeback"
import type { Stage } from "@/lib/constants"

function genJobNumber() {
  const d = new Date()
  const y = String(d.getFullYear()).slice(2)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `SW-${y}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`
}

/**
 * Opens a new job card for a car that came back with a problem from an earlier
 * job. The original advisor and technician are snapshotted onto the comeback so
 * responsibility stays with whoever did the first job, even if staff change.
 */
export async function createComebackJob(originalJobId: string, formData: FormData) {
  const ctx = await requirePermission("jobs.create")
  const supabase = await createClient()

  const reason = String(formData.get("reason") || "").trim()
  if (!reason) throw new Error("Please describe why the car came back.")
  const responsibilityInput = String(formData.get("responsibility") || "none")
  const responsibility = isComebackResponsibility(responsibilityInput) ? responsibilityInput : "none"
  // Only the owner decides who is responsible; everyone else files it for review.
  const finalResponsibility = ctx.role === "owner" ? responsibility : "none"

  const { data: original, error: loadErr } = await supabase
    .from("jobs")
    .select(
      "id, job_number, customer_name, customer_mobile, customer_id, vehicle_id, vehicle_make, vehicle_model, variant, color, body_type, vehicle_year, plate_emirate, plate_code, plate_number, vin, mileage, advisor_id, technician_id, vehicle_reference_image_url, vehicle_image_source, deleted_at",
    )
    .eq("id", originalJobId)
    .maybeSingle()
  if (loadErr) throw new Error(loadErr.message)
  if (!original || original.deleted_at) throw new Error("The original job card was not found.")

  const payload = {
    job_number: genJobNumber(),
    customer_name: original.customer_name,
    customer_mobile: original.customer_mobile,
    customer_id: original.customer_id,
    vehicle_id: original.vehicle_id,
    vehicle_make: original.vehicle_make,
    vehicle_model: original.vehicle_model,
    variant: original.variant,
    color: original.color,
    body_type: original.body_type,
    vehicle_year: original.vehicle_year,
    plate_emirate: original.plate_emirate,
    plate_code: original.plate_code,
    plate_number: original.plate_number,
    vin: original.vin,
    mileage: original.mileage,
    vehicle_reference_image_url: original.vehicle_reference_image_url,
    vehicle_image_source: original.vehicle_image_source,
    complaint: `COMEBACK from ${original.job_number}: ${reason}`,
    advisor_id: ctx.role === "service_advisor" ? ctx.userId : original.advisor_id,
    technician_id: original.technician_id,
    stage: "check_in" as Stage,
    created_by: ctx.userId,
    comeback_of: original.id,
    comeback_reason: reason,
    comeback_responsibility: finalResponsibility,
    comeback_advisor_id: original.advisor_id,
    comeback_technician_id: original.technician_id,
    comeback_note: String(formData.get("note") || "").trim() || null,
  }

  const { data, error } = await supabase.from("jobs").insert(payload).select("id").single()
  if (error) throw new Error(error.message)

  await logAction(ctx, "job.comeback_create", "job", data.id, {
    job_number: payload.job_number,
    original_job: original.job_number,
    responsibility: finalResponsibility,
  })

  const notice = {
    title: `Comeback: ${original.job_number}`,
    body: `${[original.vehicle_make, original.vehicle_model].filter(Boolean).join(" ")} came back — ${reason}`,
    type: "warning",
    link: `/jobs/${data.id}`,
  }
  const staffToNotify = new Set([original.advisor_id, original.technician_id].filter(Boolean) as string[])
  staffToNotify.delete(ctx.userId)
  await Promise.all([...staffToNotify].map((uid) => notifyUser(uid, notice).catch(() => {})))

  revalidatePath("/jobs")
  revalidatePath("/comebacks")
  revalidatePath(`/jobs/${original.id}`)
  redirect(`/jobs/${data.id}`)
}

/** Owner-only: decide who is responsible for a comeback. */
export async function setComebackResponsibility(jobId: string, responsibility: string, note: string) {
  const ctx = await requirePermission("jobs.update_status")
  if (ctx.role !== "owner") throw new Error("Only the owner can set comeback responsibility.")
  if (!isComebackResponsibility(responsibility)) throw new Error("Invalid responsibility.")
  const supabase = await createClient()

  const { data: job, error: loadErr } = await supabase
    .from("jobs")
    .select("id, job_number, comeback_of, comeback_advisor_id, comeback_technician_id")
    .eq("id", jobId)
    .maybeSingle()
  if (loadErr) throw new Error(loadErr.message)
  if (!job?.comeback_of) throw new Error("This job card is not a comeback.")

  const { error } = await supabase
    .from("jobs")
    .update({ comeback_responsibility: responsibility, comeback_note: note.trim() || null })
    .eq("id", jobId)
  if (error) throw new Error(error.message)

  await logAction(ctx, "job.comeback_responsibility", "job", jobId, { responsibility })

  const targets = new Set<string>()
  if ((responsibility === "advisor" || responsibility === "both") && job.comeback_advisor_id)
    targets.add(job.comeback_advisor_id)
  if ((responsibility === "technician" || responsibility === "both") && job.comeback_technician_id)
    targets.add(job.comeback_technician_id)
  await Promise.all(
    [...targets].map((uid) =>
      notifyUser(uid, {
        title: `Comeback ${job.job_number} assigned to you`,
        body: `Responsibility: ${comebackResponsibilityLabel(responsibility)}${note.trim() ? ` — ${note.trim()}` : ""}`,
        type: "warning",
        link: `/jobs/${jobId}`,
      }).catch(() => {}),
    ),
  )

  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/comebacks")
}
