"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import { notifyByPermission } from "@/lib/actions-notifications"
import { inferBodyType } from "@/lib/vehicle"
import { resolveVehicleImage } from "@/lib/vehicle-image"
import type { Stage } from "@/lib/constants"

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no_show"

export interface AppointmentRow {
  id: string
  name: string
  phone: string
  email: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: string | null
  plate_number: string | null
  service_interest: string | null
  preferred_date: string | null
  preferred_time: string | null
  notes: string | null
  source: string | null
  status: AppointmentStatus
  customer_id: string | null
  job_id: string | null
  confirmed_at: string | null
  cancelled_at: string | null
  created_at: string
}

async function guard(perm: Parameters<typeof requirePermission>[0]): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  ctx: SessionContext
}> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx }
}

function genJobNumber() {
  const d = new Date()
  const y = String(d.getFullYear()).slice(2)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `SW-${y}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`
}

/* ---------------- Status transitions ---------------- */

async function setStatus(
  id: string,
  status: AppointmentStatus,
  patch: Record<string, unknown> = {},
  auditAction = "appointment.update_status",
) {
  const { supabase, ctx } = await guard("appointments.manage")
  const { error } = await supabase
    .from("appointments")
    .update({ status, ...patch })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await logAction(ctx, auditAction, "appointment", id, { status })
  revalidatePath("/appointments")
}

export async function confirmAppointment(id: string) {
  await setStatus(id, "confirmed", { confirmed_at: new Date().toISOString() }, "appointment.confirm")
}

export async function rescheduleAppointment(id: string, preferredDate: string, preferredTime: string) {
  await setStatus(
    id,
    "rescheduled",
    { preferred_date: preferredDate || null, preferred_time: preferredTime || null },
    "appointment.reschedule",
  )
}

export async function cancelAppointment(id: string) {
  await setStatus(id, "cancelled", { cancelled_at: new Date().toISOString() }, "appointment.cancel")
}

export async function markNoShow(id: string) {
  await setStatus(id, "no_show", {}, "appointment.no_show")
}

/* ---------------- Duplicate customer check ---------------- */

/** Normalize a UAE-ish phone to comparable digits (last 9). */
function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "")
  return digits.slice(-9)
}

export interface CustomerMatch {
  id: string
  full_name: string
  mobile: string | null
  email: string | null
}

/** Find an existing customer whose mobile matches the appointment's phone. */
export async function findCustomerForAppointment(appointmentId: string): Promise<CustomerMatch | null> {
  const { supabase } = await guard("appointments.manage")
  const { data: appt } = await supabase
    .from("appointments")
    .select("phone")
    .eq("id", appointmentId)
    .maybeSingle()
  if (!appt?.phone) return null

  const key = phoneKey(appt.phone)
  if (key.length < 6) return null

  // Match on the trailing digits of the mobile (handles 0/971 prefixes).
  const { data: rows } = await supabase
    .from("customers")
    .select("id, full_name, mobile, email")
    .ilike("mobile", `%${key}%`)
    .limit(5)

  const match = (rows ?? []).find((c) => phoneKey(c.mobile) === key)
  return match ?? null
}

/* ---------------- Convert to job card ---------------- */

export interface ConvertResult {
  jobId: string
  customerId: string
}

/**
 * Turn a website appointment into a real job card.
 * - Reuses an existing customer when `useExistingCustomerId` is given,
 *   otherwise creates one from the appointment contact details.
 * - Creates a job at the "check_in" stage seeded with the vehicle + complaint.
 * - Links + completes the appointment so it leaves the active board.
 */
export async function convertAppointmentToJob(
  appointmentId: string,
  opts: { useExistingCustomerId?: string | null } = {},
): Promise<ConvertResult> {
  const { supabase, ctx } = await guard("appointments.manage")

  const { data: appt, error: readErr } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)
  if (!appt) throw new Error("Appointment not found")
  if (appt.job_id) throw new Error("This appointment has already been converted")

  // 1) Resolve or create the customer.
  let customerId = opts.useExistingCustomerId ?? null
  if (!customerId) {
    const { data: created, error: custErr } = await supabase
      .from("customers")
      .insert({
        full_name: (appt.name || "").trim() || "Website Booking",
        mobile: appt.phone || null,
        email: appt.email || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single()
    if (custErr) throw new Error(custErr.message)
    customerId = created.id
  }
  if (!customerId) throw new Error("Could not resolve a customer for this booking")

  // 2) Resolve a reference image (best-effort) and create the job card.
  const make = appt.vehicle_make || null
  const model = appt.vehicle_model || null
  const year = appt.vehicle_year ? Number(String(appt.vehicle_year).replace(/[^\d]/g, "")) || null : null
  let image: Awaited<ReturnType<typeof resolveVehicleImage>> = null
  try {
    image = await resolveVehicleImage({ make, model, year, color: null })
  } catch {
    /* image resolution is best-effort */
  }

  const complaintParts = [
    appt.service_interest ? `Service requested: ${appt.service_interest}` : null,
    appt.notes || null,
  ].filter(Boolean)

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      job_number: genJobNumber(),
      customer_id: customerId,
      customer_name: (appt.name || "").trim() || "Website Booking",
      customer_mobile: appt.phone || "",
      vehicle_make: make,
      vehicle_model: model,
      vehicle_year: year,
      body_type: inferBodyType(make, model),
      plate_number: appt.plate_number || null,
      vehicle_reference_image_url: image?.url ?? null,
      vehicle_image_source: image?.source ?? null,
      vehicle_image_resolved_at: image ? new Date().toISOString() : null,
      complaint: complaintParts.join("\n") || null,
      stage: "check_in" as Stage,
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (jobErr) throw new Error(jobErr.message)

  // 3) Link + complete the appointment.
  const { error: linkErr } = await supabase
    .from("appointments")
    .update({ status: "completed", customer_id: customerId, job_id: job.id })
    .eq("id", appointmentId)
  if (linkErr) throw new Error(linkErr.message)

  await logAction(ctx, "appointment.convert", "appointment", appointmentId, { job_id: job.id, customer_id: customerId })

  // Best-effort: let the workshop know a new job card exists.
  try {
    await notifyByPermission("jobs.view_all", {
      title: "Booking converted to job card",
      body: `${(appt.name || "Website booking").trim()} — ${[make, model].filter(Boolean).join(" ") || "vehicle"}.`,
      type: "info",
      link: `/jobs/${job.id}`,
    })
  } catch {
    /* best-effort */
  }

  revalidatePath("/appointments")
  revalidatePath("/crm")
  return { jobId: job.id, customerId }
}
