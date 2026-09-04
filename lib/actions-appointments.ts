"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import { notifyByPermission, notifyUser } from "@/lib/actions-notifications"
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

export type AppointmentType = "dropoff" | "pickup" | "pickup_delivery"

export type FulfillmentStatus =
  | "booked"
  | "driver_assigned"
  | "en_route_pickup"
  | "vehicle_collected"
  | "at_workshop"
  | "ready_for_delivery"
  | "en_route_delivery"
  | "delivered"

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
  // Pickup & delivery logistics
  appointment_type: AppointmentType
  fulfillment_status: FulfillmentStatus | null
  assigned_driver_id: string | null
  assigned_driver_name: string | null
  driver_assigned_at: string | null
  pickup_address: string | null
  pickup_maps_url: string | null
  pickup_building: string | null
  pickup_area: string | null
  pickup_emirate: string | null
  pickup_date: string | null
  pickup_time: string | null
  pickup_instructions: string | null
  delivery_same_as_pickup: boolean
  delivery_address: string | null
  delivery_maps_url: string | null
  delivery_date: string | null
  delivery_time: string | null
  delivery_instructions: string | null
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

/* ---------------- Pickup & delivery logistics ---------------- */

export interface DriverOption {
  id: string
  full_name: string
  role: string
}

/**
 * Staff who can act as drivers for pickup/delivery. Drivers are matched by the
 * dedicated `driver` role, and we also include `service_advisor` so smaller
 * teams can dispatch whoever is available.
 */
export async function listDrivers(): Promise<DriverOption[]> {
  const { supabase } = await guard("appointments.manage")
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["driver", "service_advisor"])
    .eq("is_active", true)
    .order("full_name")
  return (data ?? []) as DriverOption[]
}

/** Fulfillment stages a booking moves through, in order, for the CRM UI. */
export const FULFILLMENT_FLOW: { value: FulfillmentStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "driver_assigned", label: "Driver assigned" },
  { value: "en_route_pickup", label: "En route to pickup" },
  { value: "vehicle_collected", label: "Vehicle collected" },
  { value: "at_workshop", label: "At workshop" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "en_route_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
]

/** Assign (or reassign) a driver to a pickup/delivery booking. */
export async function assignDriver(appointmentId: string, driverId: string) {
  const { supabase, ctx } = await guard("appointments.manage")

  const { data: driver } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", driverId)
    .maybeSingle()
  if (!driver) throw new Error("Driver not found")

  const { data: appt, error } = await supabase
    .from("appointments")
    .update({
      assigned_driver_id: driver.id,
      assigned_driver_name: driver.full_name,
      driver_assigned_at: new Date().toISOString(),
      // Advance the pipeline the first time a driver is attached.
      fulfillment_status: "driver_assigned",
    })
    .eq("id", appointmentId)
    .select("name, email, fulfillment_status")
    .maybeSingle()
  if (error) throw new Error(error.message)

  await logAction(ctx, "appointment.assign_driver", "appointment", appointmentId, {
    driver_id: driver.id,
  })

  // Notify the assigned driver in-app.
  try {
    await notifyUser(driver.id, {
      title: "New pickup assignment",
      body: `You've been assigned to collect ${appt?.name ?? "a customer"}'s vehicle.`,
      type: "info",
      link: "/appointments",
    })
  } catch {
    /* best-effort */
  }

  // Notify the customer by email that a driver is on the way.
  await notifyCustomerFulfillment(appointmentId, "driver_assigned", appt?.email ?? null, appt?.name ?? null, {
    driverName: driver.full_name,
  })

  revalidatePath("/appointments")
}

/** Move a booking along the pickup → workshop → delivery pipeline. */
export async function updateFulfillmentStatus(appointmentId: string, status: FulfillmentStatus) {
  const { supabase, ctx } = await guard("appointments.manage")
  const { data: appt, error } = await supabase
    .from("appointments")
    .update({ fulfillment_status: status })
    .eq("id", appointmentId)
    .select("name, email")
    .maybeSingle()
  if (error) throw new Error(error.message)

  await logAction(ctx, "appointment.fulfillment_status", "appointment", appointmentId, { status })

  await notifyCustomerFulfillment(appointmentId, status, appt?.email ?? null, appt?.name ?? null, {})

  revalidatePath("/appointments")
}

/**
 * Automatic customer-facing notification for a fulfillment milestone.
 * Best-effort email (Resend); silently no-ops when there's no email or the
 * milestone isn't one we surface to customers.
 */
async function notifyCustomerFulfillment(
  _appointmentId: string,
  status: FulfillmentStatus,
  email: string | null,
  name: string | null,
  extra: { driverName?: string },
) {
  if (!email) return
  const messages: Partial<Record<FulfillmentStatus, string>> = {
    driver_assigned: extra.driverName
      ? `${extra.driverName} has been assigned to collect your vehicle and will contact you shortly.`
      : "A driver has been assigned to collect your vehicle and will contact you shortly.",
    en_route_pickup: "Your driver is on the way to collect your vehicle.",
    vehicle_collected: "Your vehicle has been collected and is on its way to our workshop.",
    at_workshop: "Your vehicle has arrived at our workshop and work will begin shortly.",
    ready_for_delivery: "Great news — your vehicle is ready and will be scheduled for delivery.",
    en_route_delivery: "Your vehicle is out for delivery and will arrive soon.",
    delivered: "Your vehicle has been delivered. Thank you for choosing SHWURX Auto Service Center.",
  }
  const message = messages[status]
  if (!message) return

  try {
    const { sendEmail } = await import("@/lib/email")
    await sendEmail({
      to: email,
      subject: "Update on your vehicle — SHWURX Auto Service Center",
      html: `<!doctype html><html><body style="margin:0;background:#0f1115;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;padding:32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#171a21;border:1px solid #262b36;border-radius:14px">
            <tr><td style="padding:28px 32px">
              <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f59e0b;font-weight:700">SHWURX Auto Service Center</div>
              <h1 style="margin:12px 0 8px;font-size:20px;color:#ffffff">Your vehicle update</h1>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#c4c9d4">Hi ${(name ?? "there").replace(/[<>&]/g, "")}, ${message}</p>
            </td></tr>
          </table>
        </td></tr></table></body></html>`,
    })
  } catch {
    /* best-effort */
  }
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
