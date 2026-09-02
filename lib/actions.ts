"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { VAT_RATE, type Stage } from "@/lib/constants"
import { inferBodyType } from "@/lib/vehicle"
import { resolveVehicleImage } from "@/lib/vehicle-image"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"
import { notifyUser, notifyByPermission } from "@/lib/actions-notifications"

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  return { supabase, user }
}

// Guard a mutating action by permission. Returns the RLS-bound client plus the
// resolved RBAC context. Throws ForbiddenError (audited) when not allowed.
async function guard(perm: Permission): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; ctx: SessionContext }> {
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

/* ---------------- Jobs ---------------- */
export async function createJob(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.create")
  const user = { id: ctx.userId }

  const make = String(formData.get("vehicle_make") || "") || null
  const model = String(formData.get("vehicle_model") || "") || null
  const bodyTypeInput = String(formData.get("body_type") || "")
  const bodyType = bodyTypeInput || inferBodyType(make, model)
  const year = formData.get("vehicle_year") ? Number(formData.get("vehicle_year")) : null
  const color = String(formData.get("color") || "") || null

  // Resolve a real reference image from CarsXE (server-side, cached in the row).
  const image = await resolveVehicleImage({ make, model, year, color })

  const payload = {
    job_number: genJobNumber(),
    customer_name: String(formData.get("customer_name") || ""),
    customer_mobile: String(formData.get("customer_mobile") || ""),
    vehicle_make: make,
    vehicle_model: model,
    variant: String(formData.get("variant") || "") || null,
    color,
    body_type: bodyType,
    vehicle_year: year,
    vehicle_reference_image_url: image?.url ?? null,
    vehicle_image_source: image?.source ?? null,
    vehicle_image_resolved_at: image ? new Date().toISOString() : null,
    plate_emirate: String(formData.get("plate_emirate") || "") || null,
    plate_code: String(formData.get("plate_code") || "") || null,
    plate_number: String(formData.get("plate_number") || "") || null,
    vin: String(formData.get("vin") || "") || null,
    mileage: formData.get("mileage") ? Number(formData.get("mileage")) : null,
    complaint: String(formData.get("complaint") || "") || null,
    advisor_id: String(formData.get("advisor_id") || "") || null,
    technician_id: String(formData.get("technician_id") || "") || null,
    notes: String(formData.get("notes") || "") || null,
    stage: "check_in" as Stage,
    created_by: user.id,
  }

  const { data, error } = await supabase.from("jobs").insert(payload).select("id").single()
  if (error) throw new Error(error.message)

  // attach uploaded photo urls (comma separated)
  const photoUrls = String(formData.get("photo_urls") || "").split(",").filter(Boolean)
  const damageUrls = String(formData.get("damage_urls") || "").split(",").filter(Boolean)
  const rows = [
    ...photoUrls.map((url) => ({ job_id: data.id, url, kind: "vehicle" })),
    ...damageUrls.map((url) => ({ job_id: data.id, url, kind: "damage" })),
  ]
  if (rows.length) await supabase.from("vehicle_photos").insert(rows)

  await logAction(ctx, "job.create", "job", data.id, { job_number: payload.job_number })
  revalidatePath("/")
  redirect(`/jobs/${data.id}`)
}

export async function updateStage(jobId: string, stage: Stage) {
  const { supabase, ctx } = await guard("jobs.update_status")
  const { error } = await supabase
    .from("jobs")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "job.update_stage", "job", jobId, { stage })
  revalidatePath("/")
  revalidatePath(`/jobs/${jobId}`)
}

// Car Flow drag & drop: move a job to a new stage (workshop zone) and optionally a lift bay.
export async function moveJobLocation(jobId: string, stage: Stage, liftBay?: string | null) {
  const { supabase } = await guard("jobs.update_status")
  const patch: Record<string, unknown> = { stage, updated_at: new Date().toISOString() }
  // Lift bay only applies to the repair/workshop zone; clear it otherwise.
  patch.lift_bay = stage === "repair" ? liftBay || null : null
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId)
  if (error) throw new Error(error.message)
  revalidatePath("/")
  revalidatePath("/flow")
  revalidatePath(`/jobs/${jobId}`)
}

// Re-resolve the CarsXE reference image for a job (manual admin/advisor refresh).
export async function refreshVehicleImage(jobId: string) {
  const { supabase } = await guard("jobs.edit")
  const { data: job, error: readErr } = await supabase
    .from("jobs")
    .select("vehicle_make, vehicle_model, vehicle_year, color, variant, vehicle_image_source")
    .eq("id", jobId)
    .single()
  if (readErr) throw new Error(readErr.message)

  // Never overwrite a manually-set custom reference photo.
  if (job.vehicle_image_source === "custom") return { found: true, custom: true }

  const image = await resolveVehicleImage({
    make: job.vehicle_make,
    model: job.vehicle_model,
    year: job.vehicle_year,
    color: job.color,
    trim: job.variant,
  })

  // On a miss keep the existing image instead of wiping it to null (→ silhouette).
  if (!image) {
    revalidatePath(`/jobs/${jobId}`)
    return { found: false }
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      vehicle_reference_image_url: image.url,
      vehicle_image_source: image.source,
      vehicle_image_resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
  if (error) throw new Error(error.message)

  revalidatePath("/")
  revalidatePath("/flow")
  revalidatePath(`/jobs/${jobId}`)
  return { found: true }
}

// Re-resolve reference images for every active job at once (bulk visual sync).
// Runs the improved make+model mapping across all cards and caches new images.
export async function refreshAllVehicleImages() {
  const { supabase } = await guard("jobs.edit")
  const { data: jobs, error: readErr } = await supabase
    .from("jobs")
    .select("id, vehicle_make, vehicle_model, vehicle_year, color, variant")
    .neq("stage", "delivered")
  if (readErr) throw new Error(readErr.message)

  let updated = 0
  let found = 0
  for (const job of jobs ?? []) {
    const image = await resolveVehicleImage({
      make: job.vehicle_make,
      model: job.vehicle_model,
      year: job.vehicle_year,
      color: job.color,
      trim: job.variant,
    })
    if (!image) continue // keep any existing image / silhouette on a miss
    const { error } = await supabase
      .from("jobs")
      .update({
        vehicle_reference_image_url: image.url,
        vehicle_image_source: image.source,
        vehicle_image_resolved_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    if (!error) {
      updated++
      found++
    }
  }

  revalidatePath("/")
  revalidatePath("/flow")
  return { total: (jobs ?? []).length, updated, found }
}

export async function assignStaff(jobId: string, field: "advisor_id" | "technician_id", value: string) {
  const { supabase, ctx } = await guard("jobs.assign")
  const { error } = await supabase
    .from("jobs")
    .update({ [field]: value || null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "job.assign", "job", jobId, { field, value: value || null })
  if (value && field === "technician_id") {
    const { data: job } = await supabase.from("jobs").select("job_number").eq("id", jobId).maybeSingle()
    await notifyUser(value, {
      title: "New job assigned to you",
      body: `You have been assigned to job ${job?.job_number ?? jobId.slice(0, 8)}.`,
      type: "assignment",
      link: `/jobs/${jobId}`,
    })
  }
  revalidatePath(`/jobs/${jobId}`)
}

export async function updateJobDetails(jobId: string, formData: FormData) {
  const { supabase } = await guard("jobs.update_status")
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const textFields = [
    "variant",
    "color",
    "body_type",
    "complaint",
    "diagnosis",
    "repair_instructions",
    "technician_notes",
    "qc_status",
  ]
  for (const f of textFields) {
    if (formData.has(f)) patch[f] = String(formData.get(f) || "") || null
  }
  if (formData.has("estimated_completion")) {
    patch.estimated_completion = String(formData.get("estimated_completion") || "") || null
  }
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/")
}

export async function addPhotos(jobId: string, urls: string[], kind: "vehicle" | "damage") {
  const { supabase } = await guard("jobs.update_status")
  if (!urls.length) return
  const { error } = await supabase
    .from("vehicle_photos")
    .insert(urls.map((url) => ({ job_id: jobId, url, kind })))
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function deletePhoto(photoId: string, jobId: string) {
  const { supabase } = await guard("jobs.update_status")
  await supabase.from("vehicle_photos").delete().eq("id", photoId)
  revalidatePath(`/jobs/${jobId}`)
}

/* ---------------- Quotation ---------------- */
export type QuoteItemInput = {
  kind: "part" | "labor"
  name: string
  part_number?: string
  detail: string
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
}

export async function saveQuotation(
  jobId: string,
  payload: {
    description: string
    internalNotes: string
    vatRate: number
    items: QuoteItemInput[]
  },
) {
  const { supabase } = await guard("quotations.create")

  const vatRate = Number.isFinite(payload.vatRate) ? payload.vatRate : VAT_RATE
  const items = payload.items

  // Per-line computation. Parts use qty*unit_price; labour uses hours*rate (or a flat rate).
  const computed = items.map((i) => {
    const qty = Number(i.quantity) || 0
    const unit = Number(i.unit_price) || 0
    const hours = Number(i.labour_hours) || 0
    const rate = Number(i.labour_rate) || 0
    const discount = Number(i.discount) || 0
    const gross = i.kind === "labor" ? (hours > 0 ? hours * rate : rate) : qty * unit
    const base = Math.max(0, gross - discount)
    const vat = (base * vatRate) / 100
    return {
      ...i,
      quantity: qty,
      unit_price: unit,
      labour_hours: hours,
      labour_rate: rate,
      discount,
      gross,
      vat,
      line_total: base + vat,
    }
  })

  const partsTotal = computed.filter((i) => i.kind === "part").reduce((s, i) => s + i.gross, 0)
  const laborTotal = computed.filter((i) => i.kind === "labor").reduce((s, i) => s + i.gross, 0)
  const discountTotal = computed.reduce((s, i) => s + i.discount, 0)
  const subtotal = partsTotal + laborTotal - discountTotal
  const vatAmount = computed.reduce((s, i) => s + i.vat, 0)
  const total = subtotal + vatAmount

  // remove previous quotations for this job (single active quotation)
  await supabase.from("quotations").delete().eq("job_id", jobId)

  const { data: quote, error } = await supabase
    .from("quotations")
    .insert({
      job_id: jobId,
      description: payload.description || null,
      internal_notes: payload.internalNotes || null,
      vat_rate: vatRate,
      parts_total: partsTotal,
      labor_total: laborTotal,
      discount_total: discountTotal,
      subtotal,
      vat_amount: vatAmount,
      total,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  if (computed.length) {
    const { error: itemErr } = await supabase.from("quotation_items").insert(
      computed.map((i) => ({
        quotation_id: quote.id,
        kind: i.kind,
        name: i.name || null,
        part_number: i.part_number || null,
        detail: i.detail || null,
        // legacy NOT NULL column — always provide a non-null value
        description: i.name || i.detail || (i.kind === "labor" ? "Labour" : "Part"),
        quantity: i.quantity,
        unit_price: i.unit_price,
        labour_hours: i.labour_hours,
        labour_rate: i.labour_rate,
        labor: 0,
        discount: i.discount,
        vat: i.vat,
        line_total: i.line_total,
      })),
    )
    if (itemErr) throw new Error(itemErr.message)
  }

  // Move to quotation stage if still earlier
  await supabase
    .from("jobs")
    .update({ stage: "quotation", approval_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("stage", ["check_in", "inspection"])

  revalidatePath(`/jobs/${jobId}`)
}

/* ---------------- Send approval to customer ---------------- */
export async function sendApproval(jobId: string) {
  const { supabase } = await guard("quotations.edit")
  const { error } = await supabase
    .from("jobs")
    .update({ stage: "customer_approval", approval_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/")
}

/* ---------------- Parts ---------------- */
export async function addPart(jobId: string, formData: FormData) {
  const { supabase } = await guard("jobs.update_status")
  const { error } = await supabase.from("parts_requests").insert({
    job_id: jobId,
    part_name: String(formData.get("part_name") || ""),
    quantity: Number(formData.get("quantity") || 1),
    supplier: String(formData.get("supplier") || "") || null,
    cost: formData.get("cost") ? Number(formData.get("cost")) : null,
    notes: String(formData.get("notes") || "") || null,
    status: "required",
  })
  if (error) throw new Error(error.message)
  await notifyByPermission("parts.manage", {
    title: "New parts request",
    body: `${String(formData.get("part_name") || "A part")} requested for a job.`,
    type: "parts",
    link: `/jobs/${jobId}`,
  })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export async function updatePart(partId: string, jobId: string, formData: FormData) {
  const { supabase } = await guard("jobs.update_status")
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (formData.get("status")) patch.status = String(formData.get("status"))
  if (formData.has("supplier")) patch.supplier = String(formData.get("supplier") || "") || null
  if (formData.has("cost")) patch.cost = formData.get("cost") ? Number(formData.get("cost")) : null
  const { error } = await supabase.from("parts_requests").update(patch).eq("id", partId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export async function deletePart(partId: string, jobId: string) {
  const { supabase } = await guard("jobs.update_status")
  await supabase.from("parts_requests").delete().eq("id", partId)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

/* ---------------- Auth ---------------- */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/auth/login")
}
