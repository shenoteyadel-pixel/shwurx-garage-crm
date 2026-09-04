"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { randomBytes } from "crypto"
import type { Stage } from "@/lib/constants"
import { inferBodyType } from "@/lib/vehicle"
import { resolveVehicleImage } from "@/lib/vehicle-image"
import { sanitizeMileage } from "@/lib/utils"
import { appBaseUrl } from "@/lib/account-links"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"

/**
 * Resolve and persist a vehicle's CarsXE reference image OUT OF BAND.
 * Runs via `after()` so the slow external lookup never blocks (or times out)
 * the save request — this is the fix for the "Save & Continue" #441 timeouts.
 * Uses the service client because request cookies may be gone post-response.
 * Never overwrites a custom (manually uploaded) photo.
 */
async function backfillVehicleImage(vehicleId: string) {
  try {
    const svc = createServiceClient()
    const { data: v } = await svc
      .from("vehicles")
      .select("make, model, year, color, variant, reference_image_url, image_source")
      .eq("id", vehicleId)
      .maybeSingle()
    if (!v) return
    if (v.image_source === "custom") return
    if (v.reference_image_url && v.image_source === "carsxe") return
    const image = await resolveVehicleImage({
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      trim: v.variant,
    })
    if (!image) return
    const stamp = new Date().toISOString()
    await svc
      .from("vehicles")
      .update({ reference_image_url: image.url, image_source: image.source, image_resolved_at: stamp })
      .eq("id", vehicleId)
    await svc
      .from("jobs")
      .update({ vehicle_reference_image_url: image.url, vehicle_image_source: image.source })
      .eq("vehicle_id", vehicleId)
  } catch (e) {
    console.log("[v0] backfillVehicleImage failed:", (e as Error).message)
  }
}

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

// Normalize a value for identity comparison (case/space/punctuation-insensitive).
function norm(v: string | null | undefined): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "")
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
    .select("id, full_name, mobile, email, company_name")
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
  payload.mileage = sanitizeMileage(fd.get("mileage"))
  if (!payload.body_type) payload.body_type = inferBodyType(payload.make as string, payload.model as string)
  return payload
}

export async function createVehicle(fd: FormData) {
  const { supabase, user } = await guard("vehicles.create")
  const payload = vehiclePayloadFromForm(fd)
  payload.created_by = user.id
  payload.customer_id = s(fd, "customer_id")

  // Save the master record FIRST; the CarsXE image resolves in the background
  // so a slow external lookup can never block or fail the save.
  const { data, error } = await supabase.from("vehicles").insert(payload).select("id").single()
  if (error) throw new Error(error.message)
  after(() => backfillVehicleImage(data.id))
  revalidatePath("/customers")
  const redirectTo = String(fd.get("redirect_to") || "")
  if (redirectTo) redirect(redirectTo)
  redirect(`/vehicles/${data.id}`)
}

export type VehicleRow = {
  id: string
  make: string | null
  model: string | null
  variant: string | null
  year: number | null
  color: string | null
  plate_emirate: string | null
  plate_code: string | null
  plate_number: string | null
  vin: string | null
  reference_image_url: string | null
}
export type VehicleSaveResult = { ok: true; vehicle: VehicleRow } | { ok: false; error: string }

// Inline create used by the intake wizard. Returns an { ok, error } result
// (never throws) so a failure shows a real message instead of the redacted
// "Minified React error #441". The CarsXE image resolves in the background
// AFTER the row is saved, so the save is instant and reliable.
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
}): Promise<VehicleSaveResult> {
  try {
    const { supabase, user } = await guard("vehicles.create")
    if (!input.customer_id) return { ok: false, error: "A customer is required before adding a vehicle." }
    if (!input.make?.trim() && !input.model?.trim() && !input.plate_number?.trim() && !input.vin?.trim()) {
      return { ok: false, error: "Enter at least a make, model, plate, or VIN to save the vehicle." }
    }
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
        mileage: sanitizeMileage(input.mileage),
        created_by: user.id,
      })
      .select(
        "id, make, model, variant, year, color, plate_emirate, plate_code, plate_number, vin, reference_image_url",
      )
      .single()
    if (error) return { ok: false, error: error.message }
    after(() => backfillVehicleImage(data.id))
    revalidatePath(`/customers/${input.customer_id}`)
    return { ok: true, vehicle: data as VehicleRow }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the vehicle. Please try again." }
  }
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

  // Read the current identity so we can detect a make/model/variant/year/color change.
  const { data: before } = await supabase
    .from("vehicles")
    .select("make, model, variant, year, color, image_source")
    .eq("id", id)
    .single()

  const patch = vehiclePayloadFromForm(fd)
  patch.updated_at = new Date().toISOString()

  const identityChanged =
    !!before &&
    (norm(before.make) !== norm(patch.make as string) ||
      norm(before.model) !== norm(patch.model as string) ||
      norm(before.variant) !== norm(patch.variant as string) ||
      String(before.year ?? "") !== String(patch.year ?? "") ||
      norm(before.color) !== norm(patch.color as string))

  // Custom (manually uploaded) reference photos are never auto-overwritten.
  const isCustom = before?.image_source === "custom"

  if (identityChanged && !isCustom) {
    const image = await resolveVehicleImage({
      make: patch.make as string,
      model: patch.model as string,
      year: patch.year as number,
      color: patch.color as string,
      trim: patch.variant as string,
    })
    patch.reference_image_url = image?.url ?? null
    patch.image_source = image?.source ?? null
    patch.image_resolved_at = new Date().toISOString()
  }

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
  revalidatePath("/crm")
  return { identityChanged: identityChanged && !isCustom }
}

// Re-resolve the cached reference image for a master vehicle (manual refresh).
// `force` overrides a custom image (used when the user explicitly clicks refresh).
export async function refreshVehicleMasterImage(id: string, opts?: { force?: boolean }) {
  const { supabase } = await guard("vehicles.edit")
  const { data: v, error: readErr } = await supabase
    .from("vehicles")
    .select("make, model, year, color, variant, image_source")
    .eq("id", id)
    .single()
  if (readErr) throw new Error(readErr.message)

  // Never silently discard a custom photo unless the caller forces it.
  if (v.image_source === "custom" && !opts?.force) return { found: true, custom: true }

  const image = await resolveVehicleImage({
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    trim: v.variant,
  })

  // On a miss, keep whatever image already exists rather than wiping to null.
  if (!image) {
    revalidatePath(`/vehicles/${id}`)
    return { found: false }
  }

  const stamp = new Date().toISOString()
  const { error } = await supabase
    .from("vehicles")
    .update({
      reference_image_url: image.url,
      image_source: image.source,
      image_resolved_at: stamp,
      updated_at: stamp,
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await supabase
    .from("jobs")
    .update({
      vehicle_reference_image_url: image.url,
      vehicle_image_source: image.source,
      updated_at: stamp,
    })
    .eq("vehicle_id", id)
  revalidatePath(`/vehicles/${id}`)
  revalidatePath("/jobs")
  revalidatePath("/flow")
  return { found: true }
}

// Save a manually-uploaded custom reference photo (owner/admin override).
// Marked source="custom" so auto-refresh never overwrites it.
export async function setCustomVehicleImage(id: string, url: string) {
  const { supabase } = await guard("vehicles.edit")
  const clean = (url || "").trim()
  if (!/^https?:\/\//.test(clean)) throw new Error("A valid image URL is required.")
  const stamp = new Date().toISOString()
  const { error } = await supabase
    .from("vehicles")
    .update({
      reference_image_url: clean,
      image_source: "custom",
      image_resolved_at: stamp,
      updated_at: stamp,
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await supabase
    .from("jobs")
    .update({ vehicle_reference_image_url: clean, vehicle_image_source: "custom", updated_at: stamp })
    .eq("vehicle_id", id)
  revalidatePath(`/vehicles/${id}`)
  revalidatePath("/jobs")
  revalidatePath("/flow")
  return { ok: true }
}

// Bulk re-resolve reference photos across ALL master vehicles. Skips vehicles
// that already have a valid non-custom image (no wasted CarsXE calls) unless
// `onlyMissing` is false. Custom images are always preserved.
export async function refreshAllMasterVehicleImages(opts?: { onlyMissing?: boolean }) {
  const { supabase } = await guard("vehicles.edit")
  const onlyMissing = opts?.onlyMissing ?? true
  const { data: vehicles, error: readErr } = await supabase
    .from("vehicles")
    .select("id, make, model, year, color, variant, reference_image_url, image_source")
  if (readErr) throw new Error(readErr.message)

  let scanned = 0
  let updated = 0
  let skipped = 0
  for (const v of vehicles ?? []) {
    if (v.image_source === "custom") {
      skipped++
      continue
    }
    // Skip vehicles that already have a resolved image when only filling gaps.
    if (onlyMissing && v.reference_image_url && v.image_source === "carsxe") {
      skipped++
      continue
    }
    scanned++
    const image = await resolveVehicleImage({
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      trim: v.variant,
    })
    if (!image) continue
    const stamp = new Date().toISOString()
    const { error } = await supabase
      .from("vehicles")
      .update({ reference_image_url: image.url, image_source: image.source, image_resolved_at: stamp })
      .eq("id", v.id)
    if (error) continue
    await supabase
      .from("jobs")
      .update({ vehicle_reference_image_url: image.url, vehicle_image_source: image.source })
      .eq("vehicle_id", v.id)
    updated++
  }
  revalidatePath("/crm")
  revalidatePath("/flow")
  revalidatePath("/vehicles")
  return { total: (vehicles ?? []).length, scanned, updated, skipped }
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

export type JobCreateResult =
  | {
      ok: true
      jobId: string
      jobNumber: string
      customerName: string
      customerMobile: string | null
      vehicleLabel: string
      plate: string | null
      trackingPath: string | null
      portalPath: string
      access: import("@/lib/actions-customer-portal").CustomerAccessResult
    }
  | { ok: false; error: string }

// The intake wizard resolves (or creates) a customer + vehicle first, then calls
// this with their ids. We snapshot the vehicle/customer fields onto the job so the
// job card remains an accurate point-in-time document even if the master changes.
// Returns an { ok, error } result (never throws) so the wizard can show a real
// success popup with honest customer-access status instead of redirecting blind.
export async function createJobFromMaster(fd: FormData): Promise<JobCreateResult> {
  try {
    const { supabase, user, ctx } = await guard("jobs.create")

    const customerId = s(fd, "customer_id")
    const vehicleId = s(fd, "vehicle_id")
    if (!customerId || !vehicleId) return { ok: false, error: "A customer and vehicle are required." }

    const [{ data: customer }, { data: vehicle }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).single(),
      supabase.from("vehicles").select("*").eq("id", vehicleId).single(),
    ])
    if (!customer || !vehicle) return { ok: false, error: "Customer or vehicle not found." }

    // Mileage the advisor entered in the wizard (validated); null if none/invalid.
    const freshMileage = fd.get("mileage") !== null ? sanitizeMileage(fd.get("mileage")) : null

    // Snapshot whatever image the vehicle already has. If none yet, it resolves
    // in the background and backfills every linked job (never blocks creation).
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
      vehicle_reference_image_url: vehicle.reference_image_url,
      vehicle_image_source: vehicle.image_source,
      vehicle_image_resolved_at: vehicle.image_resolved_at,
      plate_emirate: vehicle.plate_emirate,
      plate_code: vehicle.plate_code,
      plate_number: vehicle.plate_number,
      vin: vehicle.vin,
      mileage: freshMileage ?? sanitizeMileage(vehicle.mileage),
      complaint: s(fd, "complaint"),
      advisor_id: s(fd, "advisor_id"),
      technician_id: s(fd, "technician_id"),
      notes: s(fd, "notes"),
      stage: "check_in" as Stage,
      created_by: user.id,
    }

    const { data: job, error } = await supabase.from("jobs").insert(payload).select("id").single()
    if (error) return { ok: false, error: error.message }

    if (!vehicle.reference_image_url) after(() => backfillVehicleImage(vehicleId))

    // If the wizard collected a fresher (valid) mileage, update the master vehicle too.
    if (freshMileage !== null) {
      await supabase
        .from("vehicles")
        .update({ mileage: freshMileage, updated_at: new Date().toISOString() })
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

    const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"
    const plate = [vehicle.plate_emirate, vehicle.plate_code, vehicle.plate_number].filter(Boolean).join(" ") || null

    // Issue a secure, opaque tracking token (no raw DB ids exposed).
    let trackingPath: string | null = null
    try {
      const svc = createServiceClient()
      // Reuse a live token if one already exists for this customer.
      const { data: live } = await svc
        .from("customer_portal_tokens")
        .select("token, expires_at, revoked")
        .eq("customer_id", customerId)
        .eq("revoked", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      let token = live && !live.revoked && new Date(live.expires_at).getTime() > Date.now() ? live.token : null
      if (!token) {
        token = randomBytes(24).toString("base64url")
        await svc.from("customer_portal_tokens").insert({
          customer_id: customerId,
          token,
          expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
          created_by: user.id,
        })
      }
      trackingPath = `/track/${token}`
    } catch (e) {
      console.log("[v0] tracking token issue failed:", (e as Error).message)
    }

    // Provision (or reuse) the customer portal account and send the check-in email.
    const base = appBaseUrl()
    const { ensureCustomerPortalForJob } = await import("@/lib/actions-customer-portal")
    const access = await ensureCustomerPortalForJob({
      customerId,
      jobId: job.id,
      jobNumber: payload.job_number,
      vehicleLabel,
      plate,
      trackingUrl: trackingPath ? `${base}${trackingPath}` : `${base}/portal`,
      portalUrl: `${base}/portal`,
    })

    revalidatePath("/crm")
    revalidatePath(`/customers/${customerId}`)
    revalidatePath(`/vehicles/${vehicleId}`)
    revalidatePath("/jobs")
    revalidatePath("/flow")

    return {
      ok: true,
      jobId: job.id,
      jobNumber: payload.job_number,
      customerName: customer.full_name,
      customerMobile: customer.mobile ?? null,
      vehicleLabel,
      plate,
      trackingPath,
      portalPath: "/portal",
      access,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the job card." }
  }
}
