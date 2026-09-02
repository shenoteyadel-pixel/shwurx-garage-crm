"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { Stage } from "@/lib/constants"
import { inferBodyType } from "@/lib/vehicle"
import { resolveVehicleImage } from "@/lib/vehicle-image"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  return { supabase, user }
}

async function guard(perm: Permission): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; ctx: SessionContext; user: { id: string } }> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx, user: { id: ctx.userId } }
}

function genJobNumber() {
  const d = new Date()
  const y = String(d.getFullYear()).slice(2)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `SW-${y}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`
}

function s(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) || "").trim()
  return v || null
}

/* ---------------- Customer lookups (dedupe) ---------------- */

// Live search for the intake wizard: match on name, mobile, company.
export async function searchCustomers(query: string) {
  const { supabase } = await requireUser()
  const q = query.trim()
  if (q.length < 2) return []
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, mobile, alt_mobile, company_name, email, status")
    .or(
      `full_name.ilike.%${q}%,mobile.ilike.%${q}%,alt_mobile.ilike.%${q}%,company_name.ilike.%${q}%`,
    )
    .order("full_name")
    .limit(8)
  return data ?? []
}

// Exact mobile match — used to warn about duplicates before creating.
export async function findCustomerByMobile(mobile: string) {
  const { supabase } = await requireUser()
  const m = mobile.trim()
  if (!m) return null
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, mobile")
    .eq("mobile", m)
    .limit(1)
    .maybeSingle()
  return data
}

/* ---------------- Customer CRUD ---------------- */

const CUSTOMER_FIELDS = [
  "full_name",
  "mobile",
  "alt_mobile",
  "whatsapp",
  "email",
  "company_name",
  "trn",
  "address",
  "notes",
] as const

export async function createCustomer(fd: FormData) {
  const { supabase, user } = await guard("customers.create")
  const payload: Record<string, unknown> = { created_by: user.id }
  for (const f of CUSTOMER_FIELDS) payload[f] = s(fd, f)
  payload.full_name = s(fd, "full_name") || "Unnamed Customer"
  const { data, error } = await supabase.from("customers").insert(payload).select("id").single()
  if (error) throw new Error(error.message)
  revalidatePath("/customers")
  const redirectTo = String(fd.get("redirect_to") || "")
  if (redirectTo) redirect(redirectTo)
  redirect(`/customers/${data.id}`)
}

export async function updateCustomer(id: string, fd: FormData) {
  const { supabase } = await guard("customers.edit")
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of CUSTOMER_FIELDS) if (fd.has(f)) patch[f] = s(fd, f)
  if (fd.has("status")) patch.status = String(fd.get("status") || "active")
  const { error } = await supabase.from("customers").update(patch).eq("id", id)
  if (error) throw new Error(error.message)
  // Corrected name/mobile flow through to this customer's active job cards.
  if (fd.has("full_name") || fd.has("mobile")) {
    const jobPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (fd.has("full_name")) jobPatch.customer_name = s(fd, "full_name") || "Unnamed Customer"
    if (fd.has("mobile")) jobPatch.customer_mobile = s(fd, "mobile")
    await supabase.from("jobs").update(jobPatch).eq("customer_id", id)
  }
  revalidatePath(`/customers/${id}`)
  revalidatePath("/customers")
  revalidatePath("/jobs")
  revalidatePath("/flow")
}

// Inline create used by the intake wizard — returns the row instead of redirecting.
export async function createCustomerInline(input: {
  full_name: string
  mobile?: string | null
  alt_mobile?: string | null
  whatsapp?: string | null
  email?: string | null
  company_name?: string | null
  trn?: string | null
  address?: string | null
}) {
  const { supabase, user } = await guard("customers.create")
  const { data, error } = await supabase
    .from("customers")
    .insert({
      full_name: input.full_name.trim() || "Unnamed Customer",
      mobile: input.mobile?.trim() || null,
      alt_mobile: input.alt_mobile?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      company_name: input.company_name?.trim() || null,
      trn: input.trn?.trim() || null,
      address: input.address?.trim() || null,
      created_by: user.id,
    })
    .select("id, full_name, mobile, company_name")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/customers")
  return data
}

/* ---------------- Vehicle lookups (dedupe) ---------------- */

export async function findVehicleByVinOrPlate(input: {
  vin?: string | null
  plate_emirate?: string | null
  plate_code?: string | null
  plate_number?: string | null
}) {
  const { supabase } = await requireUser()
  const vin = (input.vin || "").trim()
  if (vin) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, make, model, year, plate_number, vin, customer_id")
      .ilike("vin", vin)
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  const plate = (input.plate_number || "").trim()
  if (plate) {
    const { data } = await supabase
      .from("vehicles")
      .select("id, make, model, year, plate_number, vin, customer_id")
      .ilike("plate_number", plate)
      .ilike("plate_code", (input.plate_code || "").trim() || "%")
      .limit(1)
      .maybeSingle()
    if (data) return data
  }
  return null
}

/* ---------------- Vehicle CRUD ---------------- */

const VEHICLE_TEXT = [
  "make",
  "model",
  "variant",
  "color",
  "plate_emirate",
  "plate_code",
  "plate_number",
  "vin",
  "engine_number",
  "body_type",
  "notes",
] as const

function vehiclePayloadFromForm(fd: FormData) {
  const payload: Record<string, unknown> = {}
  for (const f of VEHICLE_TEXT) payload[f] = s(fd, f)
  payload.year = fd.get("year") ? Number(fd.get("year")) : null
  payload.mileage = fd.get("mileage") ? Number(fd.get("mileage")) : null
  if (!payload.body_type) payload.body_type = inferBodyType(payload.make as string, payload.model as string)
  return payload
}

export async function createVehicle(fd: FormData) {
  const { supabase, user } = await guard("vehicles.create")
  const payload = vehiclePayloadFromForm(fd)
  payload.created_by = user.id
  payload.customer_id = s(fd, "customer_id")

  // Resolve reference image once at creation (cached on the master record).
  const image = await resolveVehicleImage({
    make: payload.make as string,
    model: payload.model as string,
    year: payload.year as number,
    color: payload.color as string,
    trim: payload.variant as string,
  })
  payload.reference_image_url = image?.url ?? null
  payload.image_source = image?.source ?? null
  payload.image_resolved_at = image ? new Date().toISOString() : null

  const { data, error } = await supabase.from("vehicles").insert(payload).select("id").single()
  if (error) throw new Error(error.message)
  revalidatePath("/customers")
  const redirectTo = String(fd.get("redirect_to") || "")
  if (redirectTo) redirect(redirectTo)
  redirect(`/vehicles/${data.id}`)
}

// Inline create used by the intake wizard — returns the row instead of redirecting.
export async function createVehicleInline(input: {
  customer_id: string
  make?: string | null
  model?: string | null
  variant?: string | null
  year?: number | null
  color?: string | null
  body_type?: string | null
  plate_emirate?: string | null
  plate_code?: string | null
  plate_number?: string | null
  vin?: string | null
  mileage?: number | null
}) {
  const { supabase, user } = await guard("vehicles.create")
  const image = await resolveVehicleImage({
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
    color: input.color ?? null,
    trim: input.variant ?? null,
  })
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      customer_id: input.customer_id,
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      variant: input.variant?.trim() || null,
      year: input.year || null,
      color: input.color?.trim() || null,
      body_type: input.body_type?.trim() || inferBodyType(input.make ?? null, input.model ?? null),
      plate_emirate: input.plate_emirate?.trim() || null,
      plate_code: input.plate_code?.trim() || null,
      plate_number: input.plate_number?.trim() || null,
      vin: input.vin?.trim() || null,
      mileage: input.mileage || null,
      reference_image_url: image?.url ?? null,
      image_source: image?.source ?? null,
      image_resolved_at: image ? new Date().toISOString() : null,
      created_by: user.id,
    })
    .select("id, make, model, variant, year, color, plate_emirate, plate_code, plate_number, vin, reference_image_url")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(`/customers/${input.customer_id}`)
  return data
}

// List all vehicles owned by a customer (for the wizard's vehicle step).
export async function getCustomerVehicles(customerId: string) {
  const { supabase } = await requireUser()
  const { data } = await supabase
    .from("vehicles")
    .select("id, make, model, variant, year, color, plate_emirate, plate_code, plate_number, vin, reference_image_url")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
  return data ?? []
}

// Propagate corrected vehicle identity onto every ACTIVE job card linked to this
// vehicle so Job Card, Car Flow, and Search reflect the correction immediately.
// Visit-specific mileage is intentionally left untouched. Finalized invoices keep
// their own issued snapshot (invoices.vehicle_desc/plate) and are not rewritten.
async function syncVehicleToJobs(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  vehicleId: string,
  v: Record<string, any>,
) {
  const jobPatch = {
    vehicle_make: v.make ?? null,
    vehicle_model: v.model ?? null,
    vehicle_year: v.year ?? null,
    variant: v.variant ?? null,
    color: v.color ?? null,
    plate_emirate: v.plate_emirate ?? null,
    plate_code: v.plate_code ?? null,
    plate_number: v.plate_number ?? null,
    vin: v.vin ?? null,
    body_type: v.body_type ?? null,
    vehicle_reference_image_url: v.reference_image_url ?? null,
    vehicle_image_source: v.image_source ?? null,
    updated_at: new Date().toISOString(),
  }
  await supabase.from("jobs").update(jobPatch).eq("vehicle_id", vehicleId)
}

export async function updateVehicle(id: string, fd: FormData) {
  const { supabase } = await guard("vehicles.edit")
  const patch = vehiclePayloadFromForm(fd)
  patch.updated_at = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from("vehicles")
    .update(patch)
    .eq("id", id)
    .select(
      "make, model, year, variant, color, plate_emirate, plate_code, plate_number, vin, body_type, reference_image_url, image_source",
    )
    .single()
  if (error) throw new Error(error.message)
  await syncVehicleToJobs(supabase, id, updated)
  revalidatePath(`/vehicles/${id}`)
  revalidatePath("/jobs")
  revalidatePath("/flow")
  revalidatePath("/")
}

// Re-resolve the cached reference image for a master vehicle.
export async function refreshVehicleMasterImage(id: string) {
  const { supabase } = await guard("vehicles.edit")
  const { data: v, error: readErr } = await supabase
    .from("vehicles")
    .select("make, model, year, color, variant")
    .eq("id", id)
    .single()
  if (readErr) throw new Error(readErr.message)
  const image = await resolveVehicleImage({
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    trim: v.variant,
  })
  const { error } = await supabase
    .from("vehicles")
    .update({
      reference_image_url: image?.url ?? null,
      image_source: image?.source ?? null,
      image_resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await supabase
    .from("jobs")
    .update({
      vehicle_reference_image_url: image?.url ?? null,
      vehicle_image_source: image?.source ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("vehicle_id", id)
  revalidatePath(`/vehicles/${id}`)
  revalidatePath("/jobs")
  revalidatePath("/flow")
  return { found: !!image }
}

// Transfer a vehicle to another owner (used when a car is sold).
export async function transferVehicleOwner(vehicleId: string, newCustomerId: string) {
  const { supabase, ctx } = await guard("vehicles.transfer")
  const { error } = await supabase
    .from("vehicles")
    .update({ customer_id: newCustomerId, updated_at: new Date().toISOString() })
    .eq("id", vehicleId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "vehicle.transfer", "vehicle", vehicleId, { new_customer_id: newCustomerId })
  revalidatePath(`/vehicles/${vehicleId}`)
  revalidatePath("/customers")
}

/* ---------------- Job creation from master records ---------------- */
// The intake wizard resolves (or creates) a customer + vehicle first, then calls
// this with their ids. We snapshot the vehicle/customer fields onto the job so the
// job card remains an accurate point-in-time document even if the master changes.
export async function createJobFromMaster(fd: FormData) {
  const { supabase, user, ctx } = await guard("jobs.create")

  const customerId = s(fd, "customer_id")
  const vehicleId = s(fd, "vehicle_id")
  if (!customerId || !vehicleId) throw new Error("A customer and vehicle are required.")

  const [{ data: customer }, { data: vehicle }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).single(),
    supabase.from("vehicles").select("*").eq("id", vehicleId).single(),
  ])
  if (!customer || !vehicle) throw new Error("Customer or vehicle not found.")

  // Ensure the vehicle has a cached image; resolve on demand if missing.
  let imageUrl = vehicle.reference_image_url
  let imageSource = vehicle.image_source
  let imageResolvedAt = vehicle.image_resolved_at
  if (!imageUrl) {
    const image = await resolveVehicleImage({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      trim: vehicle.variant,
    })
    if (image) {
      imageUrl = image.url
      imageSource = image.source
      imageResolvedAt = new Date().toISOString()
      await supabase
        .from("vehicles")
        .update({ reference_image_url: imageUrl, image_source: imageSource, image_resolved_at: imageResolvedAt })
        .eq("id", vehicleId)
    }
  }

  const payload = {
    job_number: genJobNumber(),
    customer_id: customerId,
    vehicle_id: vehicleId,
    // Snapshot (denormalized) fields — keep the job card self-contained.
    customer_name: customer.full_name,
    customer_mobile: customer.mobile ?? "",
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    variant: vehicle.variant,
    color: vehicle.color,
    body_type: vehicle.body_type || inferBodyType(vehicle.make, vehicle.model),
    vehicle_year: vehicle.year,
    vehicle_reference_image_url: imageUrl,
    vehicle_image_source: imageSource,
    vehicle_image_resolved_at: imageResolvedAt,
    plate_emirate: vehicle.plate_emirate,
    plate_code: vehicle.plate_code,
    plate_number: vehicle.plate_number,
    vin: vehicle.vin,
    mileage: fd.get("mileage") ? Number(fd.get("mileage")) : vehicle.mileage,
    complaint: s(fd, "complaint"),
    advisor_id: s(fd, "advisor_id"),
    technician_id: s(fd, "technician_id"),
    notes: s(fd, "notes"),
    stage: "check_in" as Stage,
    created_by: user.id,
  }

  const { data: job, error } = await supabase.from("jobs").insert(payload).select("id").single()
  if (error) throw new Error(error.message)

  // If the wizard collected a fresher mileage, update the master vehicle too.
  if (fd.get("mileage")) {
    await supabase
      .from("vehicles")
      .update({ mileage: Number(fd.get("mileage")), updated_at: new Date().toISOString() })
      .eq("id", vehicleId)
  }

  const photoUrls = String(fd.get("photo_urls") || "").split(",").filter(Boolean)
  const damageUrls = String(fd.get("damage_urls") || "").split(",").filter(Boolean)
  const rows = [
    ...photoUrls.map((url) => ({ job_id: job.id, url, kind: "vehicle" })),
    ...damageUrls.map((url) => ({ job_id: job.id, url, kind: "damage" })),
  ]
  if (rows.length) await supabase.from("vehicle_photos").insert(rows)

  await logAction(ctx, "job.create", "job", job.id, { job_number: payload.job_number })
  revalidatePath("/")
  revalidatePath(`/customers/${customerId}`)
  revalidatePath(`/vehicles/${vehicleId}`)
  redirect(`/jobs/${job.id}`)
}
