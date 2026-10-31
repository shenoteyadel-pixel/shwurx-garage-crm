"use server"

import { logCurrent } from "@/lib/rbac/context"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { checkWorkAuthorization } from "@/lib/work-authorization"
import { requiredScopeForMove } from "@/lib/work-authorization-rules"
import { pricesMatch, quoteUnitPrice } from "@/lib/parts-catalog"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { VAT_RATE, type Stage } from "@/lib/constants"
import { inferBodyType } from "@/lib/vehicle"
import { resolveVehicleImage } from "@/lib/vehicle-image"
import { attachJobVehicleImage, attachVehicleMasterImage } from "@/lib/vehicle-image-attach"
import { sanitizeMileage } from "@/lib/utils"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import { requireJobWork } from "@/lib/rbac/job-access"
import type { Permission } from "@/lib/rbac/roles"
import { notifyUser, notifyByPermission, notifyOwners } from "@/lib/actions-notifications"
import { notifyActivity } from "@/lib/activity"
import { notifyJobTechnicians, notifyPurchasers } from "@/lib/job-notify"
import { issueGatePass } from "@/lib/gate-pass"
import { bestPartMatch, isSamePart, partDocLink } from "@/lib/part-match"
import { syncPendingApproval } from "@/lib/actions-approvals"
import { resyncQuotationAddons } from "@/lib/addons"
import { getSettings } from "@/lib/settings"
import { isCloseReason } from "@/lib/job-close"
import {
  PHOTO_KINDS,
  TRADE_VALUES,
  tradeFromTitle,
  tradeLabel,
  type PhotoKind,
  type Trade,
} from "@/lib/trades"

/**
 * When a job reaches "delivered", start the tracking-link grace window for the
 * customer: stamp expires_at = now + owner-configured days (0 = never). The
 * token resolver ignores this while any job is still open, so re-stamping on
 * each delivery simply refreshes the countdown. Best-effort — never blocks the
 * stage change.
 */
async function startTrackingExpiryForDeliveredJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
) {
  try {
    const { data: job } = await supabase.from("jobs").select("customer_id").eq("id", jobId).maybeSingle()
    if (!job?.customer_id) return
    const settings = await getSettings()
    const days = settings.tracking_expire_after_delivery_days ?? 30
    // 0 = never expire: push the deadline far into the future.
    const expiresAt =
      days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from("customer_portal_tokens")
      .update({ expires_at: expiresAt, expiry_mode: "while_open" })
      .eq("customer_id", job.customer_id)
      .eq("revoked", false)
  } catch {
    // best-effort; tracking access is not critical to the stage change
  }
}

/**
 * A delivered car has had its parts fitted, so any request still marked
 * required/ordered/backordered is stale. Mark them received so they stop
 * showing as pending. Best-effort — never blocks delivery.
 */
async function closeOpenPartsForDeliveredJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
) {
  try {
    await supabase
      .from("parts_requests")
      .update({ status: "received", updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .in("status", ["required", "ordered", "backordered"])
      .is("deleted_at", null)
  } catch {
    // best-effort
  }
  revalidatePath("/parts")
}

async function onJobDelivered(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string) {
  await startTrackingExpiryForDeliveredJob(supabase, jobId)
  await closeOpenPartsForDeliveredJob(supabase, jobId)
}

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
    // Image is generated in the background after insert (see below) so the user
    // isn't blocked on the ~30-60s studio render.
    vehicle_reference_image_url: null,
    vehicle_image_source: null,
    vehicle_image_resolved_at: null,
    plate_emirate: String(formData.get("plate_emirate") || "") || null,
    plate_code: String(formData.get("plate_code") || "") || null,
    plate_number: String(formData.get("plate_number") || "") || null,
    vin: String(formData.get("vin") || "") || null,
    mileage: sanitizeMileage(formData.get("mileage")),
    complaint: String(formData.get("complaint") || "") || null,
    // A service advisor opening a job card owns it automatically; only the
    // Owner may pick (or later change) a different advisor.
    advisor_id: ctx.role === "service_advisor" ? ctx.userId : String(formData.get("advisor_id") || "") || null,
    technician_id: String(formData.get("technician_id") || "") || null,
    notes: String(formData.get("notes") || "") || null,
    stage: "check_in" as Stage,
    created_by: user.id,
  }

  const { data, error } = await supabase.from("jobs").insert(payload).select("id").single()
  if (error) throw new Error(error.message)

  // Kick off the uniform studio image generation without blocking the response.
  after(() => attachJobVehicleImage(data.id, { make, model, year, color, trim: payload.variant }))

  // attach uploaded photo urls (comma separated)
  const photoUrls = String(formData.get("photo_urls") || "").split(",").filter(Boolean)
  const damageUrls = String(formData.get("damage_urls") || "").split(",").filter(Boolean)
  const rows = [
    ...photoUrls.map((url) => ({ job_id: data.id, url, kind: "vehicle", uploaded_by: user.id })),
    ...damageUrls.map((url) => ({ job_id: data.id, url, kind: "damage", uploaded_by: user.id })),
  ]
  if (rows.length) await supabase.from("vehicle_photos").insert(rows)

  await logAction(ctx, "job.create", "job", data.id, { job_number: payload.job_number })
  revalidatePath("/crm")
  redirect(`/jobs/${data.id}`)
}

async function workGateForMove(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  stage: Stage,
): Promise<string | null> {
  const { data: current } = await supabase.from("jobs").select("stage").eq("id", jobId).maybeSingle()
  const scope = requiredScopeForMove((current?.stage as Stage | undefined) ?? null, stage)
  if (!scope) return null
  const check = await checkWorkAuthorization(jobId, scope)
  return check.ok ? null : check.error
}

export async function updateStage(
  jobId: string,
  stage: Stage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, ctx } = await guard("jobs.update_status")
  const blocked = await workGateForMove(supabase, jobId, stage)
  if (blocked) return { ok: false, error: blocked }
  const { error } = await supabase
    .from("jobs")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  if (stage === "delivered") await onJobDelivered(supabase, jobId)
  await logAction(ctx, "job.update_stage", "job", jobId, { stage })
  revalidatePath("/crm")
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true }
}

// Car Flow drag & drop: move a job to a new stage (workshop zone) and optionally a lift bay.
export async function moveJobLocation(
  jobId: string,
  stage: Stage,
  liftBay?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await guard("jobs.update_status")
  const blocked = await workGateForMove(supabase, jobId, stage)
  if (blocked) return { ok: false, error: blocked }
  const patch: Record<string, unknown> = { stage, updated_at: new Date().toISOString() }
  // Lift bay only applies to the repair/workshop zone; clear it otherwise.
  patch.lift_bay = stage === "repair" ? liftBay || null : null
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId)
  if (error) throw new Error(error.message)
  if (stage === "delivered") await onJobDelivered(supabase, jobId)
  await logCurrent("job.move", "job", jobId, { stage, lift_bay: liftBay ?? null })
  revalidatePath("/crm")
  revalidatePath("/flow")
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true }
}

/**
 * Record customer payment for a delivered job. This is the "Paid" step of the
 * delivery flow: it stamps paid_at (+ optional amount/method), and ensures the
 * job is in the delivered stage. Once paid, the boards move it to history.
 */
export async function markJobPaid(
  jobId: string,
  opts: { amount?: number | null; method?: string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string; needsInvoice?: boolean }> {
  const { supabase, ctx } = await guard("jobs.update_status")
  const user = { id: ctx.userId }
  const amount = opts.amount != null && !Number.isNaN(Number(opts.amount)) ? Number(opts.amount) : null
  const method = opts.method?.trim() || null
  const nowIso = new Date().toISOString()

  // A payment must always be backed by a customer (VAT) invoice, otherwise the
  // money is recorded only on the job/gate pass and no invoice ever exists.
  const { data: existingInvoices, error: invErr } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .limit(1)
  if (invErr) return { ok: false, error: `Could not check the job's invoice: ${invErr.message}` }
  if (!existingInvoices?.length) {
    return {
      ok: false,
      needsInvoice: true,
      error: "This job has no invoice yet. Create the customer invoice first, then record the payment.",
    }
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      stage: "delivered",
      paid_at: nowIso,
      paid_amount: amount,
      payment_method: method,
      updated_at: nowIso,
    })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  await closeOpenPartsForDeliveredJob(supabase, jobId)

  // Keep the invoice in sync: if this job has an open invoice, settle it too so
  // the invoice list / detail page don't keep showing "unpaid" after cash was
  // collected here. Record the payment against the invoice's remaining balance.
  const { data: openInvoices } = await supabase
    .from("invoices")
    .select("id, total, amount_paid")
    .eq("job_id", jobId)
    .in("status", ["unpaid", "partial"])
  for (const inv of openInvoices ?? []) {
    const total = Number(inv.total) || 0
    const already = Number(inv.amount_paid) || 0
    const balance = Math.max(0, total - already)
    if (balance <= 0) continue
    await supabase.from("payments").insert({
      direction: "in",
      invoice_id: inv.id,
      amount: balance,
      method: (method || "Cash").toLowerCase(),
      note: "Recorded from Car Flow delivery payment",
      created_by: user.id,
    })
    await supabase
      .from("invoices")
      .update({ amount_paid: already + balance, status: "paid", updated_at: nowIso })
      .eq("id", inv.id)
    revalidatePath(`/invoices/${inv.id}`)
  }

  await issueGatePass(jobId, { amount, method, issuedBy: ctx.userId })

  await logAction(ctx, "job.mark_paid", "job", jobId, { amount, method })
  revalidatePath("/crm")
  revalidatePath("/flow")
  revalidatePath("/history")
  revalidatePath("/invoices")
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true }
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

  revalidatePath("/crm")
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

  // Generate in parallel — each studio render takes ~30-60s, so running them
  // serially would blow past the function time limit on a full board.
  const results = await Promise.all(
    (jobs ?? []).map(async (job) => {
      const image = await resolveVehicleImage({
        make: job.vehicle_make,
        model: job.vehicle_model,
        year: job.vehicle_year,
        color: job.color,
        trim: job.variant,
      })
      if (!image) return false // keep any existing image / silhouette on a miss
      const { error } = await supabase
        .from("jobs")
        .update({
          vehicle_reference_image_url: image.url,
          vehicle_image_source: image.source,
          vehicle_image_resolved_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      return !error
    }),
  )
  const updated = results.filter(Boolean).length
  const found = updated

  revalidatePath("/crm")
  revalidatePath("/flow")
  return { total: (jobs ?? []).length, updated, found }
}

export async function assignStaff(jobId: string, field: "advisor_id" | "technician_id", value: string) {
  const { supabase, ctx } = await guard("jobs.assign")
  if (field === "advisor_id" && ctx.role !== "owner") {
    throw new Error("Only the Owner can change the service advisor.")
  }
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
  if (value && field === "technician_id") {
    const { data: p } = await supabase.from("profiles").select("job_title").eq("id", value).maybeSingle()
    await supabase
      .from("job_technicians")
      .upsert(
        { job_id: jobId, user_id: value, trade: tradeFromTitle(p?.job_title), assigned_by: ctx.userId },
        { onConflict: "job_id,user_id", ignoreDuplicates: true },
      )
  }
  revalidatePath(`/jobs/${jobId}`)
}

/** Add a technician to the job team (several technicians can work on one car). */
export async function addJobTechnician(jobId: string, userId: string, trade: Trade) {
  const { supabase, ctx } = await guard("jobs.assign")
  if (!jobId || !userId) throw new Error("Pick a technician")
  const safeTrade: Trade = TRADE_VALUES.includes(trade) ? trade : "mechanic"
  const { error } = await supabase
    .from("job_technicians")
    .upsert({ job_id: jobId, user_id: userId, trade: safeTrade, assigned_by: ctx.userId }, { onConflict: "job_id,user_id" })
  if (error) throw new Error(error.message)

  // Keep jobs.technician_id as the lead technician for lists and reports.
  const { data: job } = await supabase.from("jobs").select("job_number, technician_id").eq("id", jobId).maybeSingle()
  if (job && !job.technician_id) {
    await supabase.from("jobs").update({ technician_id: userId, updated_at: new Date().toISOString() }).eq("id", jobId)
  }
  await logAction(ctx, "job.technician_add", "job", jobId, { userId, trade: safeTrade })
  await notifyUser(userId, {
    title: "New job assigned to you",
    body: `You were added as ${tradeLabel(safeTrade)} on job ${job?.job_number ?? jobId.slice(0, 8)}.`,
    type: "assignment",
    link: `/jobs/${jobId}`,
  })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
}

export async function removeJobTechnician(jobId: string, userId: string) {
  const { supabase, ctx } = await guard("jobs.assign")
  const { error } = await supabase.from("job_technicians").delete().eq("job_id", jobId).eq("user_id", userId)
  if (error) throw new Error(error.message)
  const { data: job } = await supabase.from("jobs").select("technician_id").eq("id", jobId).maybeSingle()
  if (job?.technician_id === userId) {
    const { data: next } = await supabase
      .from("job_technicians")
      .select("user_id")
      .eq("job_id", jobId)
      .order("created_at")
      .limit(1)
      .maybeSingle()
    await supabase
      .from("jobs")
      .update({ technician_id: next?.user_id ?? null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
  }
  await logAction(ctx, "job.technician_remove", "job", jobId, { userId })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
}

export async function updateJobDetails(jobId: string, formData: FormData) {
  const { supabase } = await guard("jobs.update_status")
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const textFields = [
    "vehicle_make",
    "vehicle_model",
    "variant",
    "color",
    "body_type",
    "vin",
    "plate_emirate",
    "plate_code",
    "plate_number",
    "complaint",
    "diagnosis",
    "repair_instructions",
    "technician_notes",
    "qc_status",
  ]
  for (const f of textFields) {
    if (formData.has(f)) patch[f] = String(formData.get(f) || "").trim() || null
  }
  // Numeric fields — accept blank as null, otherwise coerce and ignore junk.
  const numberFields = ["vehicle_year", "mileage"]
  for (const f of numberFields) {
    if (formData.has(f)) {
      const raw = String(formData.get(f) || "").trim()
      patch[f] = raw ? Number(raw.replace(/[^\d.-]/g, "")) || null : null
    }
  }
  if (formData.has("estimated_completion")) {
    patch.estimated_completion = String(formData.get("estimated_completion") || "") || null
  }
  const { data: before } = await supabase
    .from("jobs")
    .select("vehicle_id, vehicle_make, vehicle_model, variant, vehicle_year, color, vehicle_image_source")
    .eq("id", jobId)
    .maybeSingle()

  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
  const changed = (field: string, prev: unknown) => field in patch && norm(patch[field]) !== norm(prev)
  const identityChanged =
    !!before &&
    (changed("vehicle_make", before.vehicle_make) ||
      changed("vehicle_model", before.vehicle_model) ||
      changed("variant", before.variant) ||
      changed("vehicle_year", before.vehicle_year) ||
      changed("color", before.color))
  const regenerateImage = identityChanged && before?.vehicle_image_source !== "custom"
  if (regenerateImage) {
    // The old studio render shows the previous model — clear it so the board
    // shows the silhouette until the correct image is generated.
    patch.vehicle_reference_image_url = null
    patch.vehicle_image_source = null
  }

  const { data: saved, error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .select("vehicle_id, vehicle_make, vehicle_model, variant, vehicle_year, color, vin, body_type")
    .single()
  if (error) throw new Error(error.message)

  // Keep the master vehicle record in sync so the corrected make/model sticks
  // for future visits and isn't re-copied from the old (wrong) profile.
  if (saved?.vehicle_id && identityChanged) {
    await supabase
      .from("vehicles")
      .update({
        make: saved.vehicle_make,
        model: saved.vehicle_model,
        variant: saved.variant,
        year: saved.vehicle_year,
        color: saved.color,
        ...(saved.vin ? { vin: saved.vin } : {}),
        ...(saved.body_type ? { body_type: saved.body_type } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", saved.vehicle_id)
  }

  if (regenerateImage && saved) {
    const identity = {
      make: saved.vehicle_make,
      model: saved.vehicle_model,
      year: saved.vehicle_year,
      color: saved.color,
      trim: saved.variant,
    }
    const vehicleId = saved.vehicle_id as string | null
    after(() => (vehicleId ? attachVehicleMasterImage(vehicleId, identity) : attachJobVehicleImage(jobId, identity)))
  }

  await logCurrent("job.update_details", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/crm")
  revalidatePath("/flow")
}

/**
 * Soft-delete a job card into the Recycle Bin (Owner only). We never hard-delete
 * because job cards are referenced by invoices and supplier-invoice items, so a
 * hard delete would either fail or sever accounting history. Setting deleted_at
 * hides it everywhere while keeping it fully restorable from the Recycle Bin.
 */
export async function deleteJob(jobId: string, reason?: string, note?: string) {
  const { supabase, ctx } = await guard("jobs.delete")
  if (ctx.role !== "owner") throw new Error("Only the Owner can delete job cards.")
  const closeReason = isCloseReason(reason) ? reason : "other"
  const closeNote = (note ?? "").trim().slice(0, 500) || null
  const { error } = await supabase
    .from("jobs")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: ctx.userId,
      close_reason: closeReason,
      close_note: closeNote,
    })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "job.delete", "job", jobId, { reason: closeReason, note: closeNote })
  revalidatePath("/flow")
  revalidatePath("/crm")
  revalidatePath("/jobs")
  revalidatePath("/history")
  revalidatePath("/recycle-bin")
  redirect("/flow")
}

// Photo categories. "vehicle" = exterior/general car shots; the cover photo is
// chosen explicitly (see setCoverPhoto), never auto-derived from these.
export type { PhotoKind } from "@/lib/trades"

export async function addPhotos(jobId: string, urls: string[], kind: PhotoKind) {
  const { supabase, ctx } = await guard("jobs.update_status")
  if (!urls.length) return
  const safeKind: PhotoKind = PHOTO_KINDS.includes(kind) ? kind : "other"
  const { error } = await supabase
    .from("vehicle_photos")
    .insert(urls.map((url) => ({ job_id: jobId, url, kind: safeKind, uploaded_by: ctx.userId })))
  if (error) throw new Error(error.message)
  await notifyActivity({
    title: "Photos uploaded",
    body: `${urls.length} ${safeKind} photo(s)`,
    link: `/jobs/${jobId}`,
  })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
  revalidatePath("/crm")
}

export async function deletePhoto(photoId: string, jobId: string) {
  const { supabase, ctx } = await guard("jobs.update_status")
  // If this photo was the cover, clear the cover so nothing points at an archived URL.
  const { data: photo } = await supabase.from("vehicle_photos").select("url").eq("id", photoId).maybeSingle()
  // Soft delete: archive so it can be restored from the Recycle Bin.
  await supabase
    .from("vehicle_photos")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
    .eq("id", photoId)
  await logAction(ctx, "photo_archived", "job", jobId, { photoId })
  if (photo?.url) {
    await supabase.from("jobs").update({ cover_photo_url: null }).eq("id", jobId).eq("cover_photo_url", photo.url)
  }
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
  revalidatePath("/crm")
}

/** Set the explicit vehicle cover photo for a job. This is the ONLY way a cover is chosen. */
export async function setCoverPhoto(jobId: string, url: string) {
  const { supabase } = await guard("jobs.update_status")
  if (!jobId || !url) throw new Error("Missing job or photo")
  const { error } = await supabase.from("jobs").update({ cover_photo_url: url }).eq("id", jobId)
  if (error) throw new Error(error.message)
  await logCurrent("job.cover_photo", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
  revalidatePath("/crm")
  revalidatePath("/jobs")
}

/** Remove the explicit vehicle cover photo, reverting to the professional placeholder. */
export async function clearCoverPhoto(jobId: string) {
  const { supabase } = await guard("jobs.update_status")
  const { error } = await supabase.from("jobs").update({ cover_photo_url: null }).eq("id", jobId)
  if (error) throw new Error(error.message)
  await logCurrent("job.cover_photo_clear", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/flow")
  revalidatePath("/crm")
  revalidatePath("/jobs")
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
  category?: string
  recommendation?: "required" | "recommended" | "optional"
  lead_time_days?: number
  catalog_id?: string | null
  catalog_revision_id?: string | null
  }

function cleanLeadTime(kind: string, days: unknown): number | null {
  const d = Math.round(Number(days) || 0)
  return kind === "part" && d >= 1 && d <= 30 ? d : null
}

export async function saveQuotation(
  jobId: string,
  payload: {
    description: string
    internalNotes: string
    vatRate: number
    vatInclusive?: boolean
    items: QuoteItemInput[]
  },
) {
  const { supabase, ctx } = await guard("quotations.create")

  const vatRate = Number.isFinite(payload.vatRate) ? payload.vatRate : VAT_RATE
  const vatInclusive = Boolean(payload.vatInclusive)
  const items = payload.items

  // Lines picked from the price catalog must carry the current approved price.
  const catalogLines = items.filter((i) => i.kind === "part" && i.catalog_revision_id)
  if (catalogLines.length) {
    const { data: currentPrices } = await createServiceClient()
      .from("parts_price_current")
      .select("catalog_id, revision_id, selling_price")
      .in(
        "catalog_id",
        catalogLines.map((i) => i.catalog_id as string),
      )
    const byItem = new Map((currentPrices ?? []).map((p) => [p.catalog_id as string, p]))
    for (const line of catalogLines) {
      const current = byItem.get(line.catalog_id as string)
      if (!current || current.revision_id !== line.catalog_revision_id) {
        return {
          ok: false as const,
          error: `The approved price for "${line.name}" has changed. Remove it and pick it again from the catalog.`,
        }
      }
      if (!pricesMatch(Number(line.unit_price), quoteUnitPrice(Number(current.selling_price), vatRate, vatInclusive))) {
        return {
          ok: false as const,
          error: `"${line.name}" must use its approved catalog price. Ask management to approve a price change instead.`,
        }
      }
    }
  }

  // Per-line computation. Parts use qty*unit_price; labour uses hours*rate (or a flat rate).
  // VAT-exclusive: entered prices are pre-VAT, VAT is added on top.
  // VAT-inclusive: entered prices already contain VAT, back-calculate the taxable base.
  const computed = items.map((i, idx) => {
    const qty = Number(i.quantity) || 0
    const unit = Number(i.unit_price) || 0
    const hours = Number(i.labour_hours) || 0
    const rate = Number(i.labour_rate) || 0
    const discount = Number(i.discount) || 0
    const gross = i.kind === "labor" ? (hours > 0 ? hours * rate : rate) : qty * unit
    const base = Math.max(0, gross - discount)
    let net: number
    let vat: number
    let lineTotal: number
    if (vatInclusive) {
      // `base` is VAT-inclusive
      lineTotal = base
      net = base / (1 + vatRate / 100)
      vat = base - net
    } else {
      net = base
      vat = (base * vatRate) / 100
      lineTotal = base + vat
    }
    return {
      ...i,
      quantity: qty,
      unit_price: unit,
      labour_hours: hours,
      labour_rate: rate,
      discount,
      gross,
      net,
      vat,
      line_total: lineTotal,
      sort_order: idx,
    }
  })

  // For inclusive mode parts/labour "totals" are the net (ex-VAT) contribution so the
  // subtotal + VAT = grand total identity always holds.
  const partsTotal = computed.filter((i) => i.kind === "part").reduce((s, i) => s + (vatInclusive ? i.net : i.gross), 0)
  const laborTotal = computed.filter((i) => i.kind === "labor").reduce((s, i) => s + (vatInclusive ? i.net : i.gross), 0)
  const discountTotal = computed.reduce((s, i) => s + i.discount, 0)
  const vatAmount = computed.reduce((s, i) => s + i.vat, 0)
  const subtotal = vatInclusive ? partsTotal + laborTotal : partsTotal + laborTotal - discountTotal
  const total = subtotal + vatAmount

  // An approved quotation is locked; only the owner and service advisors may
  // correct it, and the owner is told about every part change an advisor makes.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("approval_status, job_number")
    .eq("id", jobId)
    .maybeSingle()
  const editingApproved = jobRow?.approval_status === "approved"
  if (editingApproved && !APPROVED_QUOTE_EDITORS.includes(ctx.role)) {
    throw new Error("This quotation is approved and locked. Only the owner or a service advisor can edit it.")
  }
  let previousParts: PartSnapshot[] | null = null
  if (editingApproved && ctx.role !== "owner") {
    const { data: prevQuote } = await supabase
      .from("quotations")
      .select("quotation_items(kind, name, part_number, quantity)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    previousParts = toPartSnapshots(
      ((prevQuote?.quotation_items ?? []) as { kind: string; name: string | null; part_number: string | null; quantity: number | null }[]),
    )
  }

  const header = {
    description: payload.description || null,
    internal_notes: payload.internalNotes || null,
    vat_rate: vatRate,
    vat_inclusive: vatInclusive,
    parts_total: partsTotal,
    labor_total: laborTotal,
    discount_total: discountTotal,
    subtotal,
    vat_amount: vatAmount,
    total,
  }

  // Single active quotation per job. Update it in place (keeping its id, so
  // customer approval records stay linked) and rebuild its lines.
  const { data: existingQuotes } = await supabase
    .from("quotations")
    .select("id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
  const keep = existingQuotes?.[0]?.id as string | undefined
  let quote: { id: string }
  if (keep) {
    const extra = (existingQuotes ?? []).slice(1).map((q) => q.id as string)
    if (extra.length) await supabase.from("quotations").delete().in("id", extra)
    const { error: updErr } = await supabase.from("quotations").update(header).eq("id", keep)
    if (updErr) throw new Error(updErr.message)
    const { error: delErr } = await supabase.from("quotation_items").delete().eq("quotation_id", keep)
    if (delErr) throw new Error(delErr.message)
    quote = { id: keep }
  } else {
    const { data: created, error } = await supabase
      .from("quotations")
      .insert({ job_id: jobId, ...header })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    quote = created
  }

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
        category: i.category?.trim() || null,
        recommendation: i.recommendation || "required",
        lead_time_days: cleanLeadTime(i.kind, i.lead_time_days),
        sort_order: i.sort_order,
        catalog_id: i.kind === "part" && i.catalog_revision_id ? i.catalog_id : null,
        catalog_revision_id: i.kind === "part" && i.catalog_revision_id ? i.catalog_revision_id : null,
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

  // Re-materialise linked add-on services (wash / pickup / delivery) onto this
  // freshly-rebuilt quotation so they are never lost when the quote is re-saved.
  try {
    await resyncQuotationAddons(supabase, jobId)
  } catch {
    // ignore
  }

  // Keep the customer's pending approval link current with these changes
  // (best-effort — staff can always re-send from the approvals panel).
  try {
    await syncPendingApproval(jobId)
  } catch {
    // ignore
  }

  if (previousParts) {
    try {
      const changes = describePartChanges(previousParts, toPartSnapshots(computed))
      await notifyOwners({
        title: `Approved job card edited${jobRow?.job_number ? ` — ${jobRow.job_number}` : ""}`,
        body: `Service advisor ${changes || "edited the quotation (no part changes)"}`,
        type: "warning",
        link: `/jobs/${jobId}`,
      })
    } catch {
      // notification is best-effort; the save itself succeeded
    }
  }

  await notifyActivity({ title: "Quotation saved", body: `${items.length} line item(s)`, link: `/jobs/${jobId}` })
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true as const }
}

const APPROVED_QUOTE_EDITORS: string[] = ["owner", "service_advisor"]

type PartSnapshot = { key: string; label: string; quantity: number }

function toPartSnapshots(
  rows: { kind: string; name?: string | null; part_number?: string | null; quantity?: number | null }[],
): PartSnapshot[] {
  return rows
    .filter((r) => r.kind === "part")
    .map((r) => {
      const label = (r.name || r.part_number || "Part").trim()
      return {
        key: (r.part_number || r.name || "").trim().toLowerCase() || label.toLowerCase(),
        label,
        quantity: Number(r.quantity) || 0,
      }
    })
}

function describePartChanges(before: PartSnapshot[], after: PartSnapshot[]): string {
  const tally = (list: PartSnapshot[]) => {
    const map = new Map<string, { label: string; quantity: number }>()
    for (const p of list) {
      const cur = map.get(p.key)
      map.set(p.key, { label: cur?.label ?? p.label, quantity: (cur?.quantity ?? 0) + p.quantity })
    }
    return map
  }
  const was = tally(before)
  const now = tally(after)
  const added: string[] = []
  const removed: string[] = []
  for (const [key, p] of now) {
    const diff = p.quantity - (was.get(key)?.quantity ?? 0)
    if (diff > 0) added.push(`${p.label} ×${diff}`)
  }
  for (const [key, p] of was) {
    const diff = p.quantity - (now.get(key)?.quantity ?? 0)
    if (diff > 0) removed.push(`${p.label} ×${diff}`)
  }
  const parts: string[] = []
  if (added.length) parts.push(`added: ${added.join(", ")}`)
  if (removed.length) parts.push(`removed: ${removed.join(", ")}`)
  return parts.join("; ")
}

/* ---------------- Convert parts requests into the quotation ---------------- */
// Pulls every active Parts Request line onto the customer quotation as part
// items so they can be sent for approval. Existing quotation lines (labour and
// any parts already added) are preserved, and parts already present by name are
// skipped so this is safe to run more than once.
export async function sendPartsToQuotation(jobId: string) {
  const { supabase } = await guard("quotations.create")

  const { data: job } = await supabase.from("jobs").select("approval_status").eq("id", jobId).maybeSingle()
  if (job?.approval_status === "approved") {
    throw new Error("This quotation has been approved and is locked.")
  }

  // Existing quotation (if any) — keep its settings and current line items.
  const { data: quotation } = await supabase
    .from("quotations")
    .select(
      "vat_rate, vat_inclusive, description, internal_notes, quotation_items(kind, name, part_number, detail, quantity, unit_price, labour_hours, labour_rate, discount, category, recommendation, lead_time_days, sort_order, addon_type)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const existingItems: QuoteItemInput[] = ((quotation?.quotation_items as any[]) ?? [])
    // Add-on service lines are owned by resyncQuotationAddons — never carry them
    // through here or they would be duplicated as plain quote items.
    .filter((i) => !i.addon_type)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => ({
      kind: i.kind === "labor" ? "labor" : "part",
      name: i.name ?? "",
      part_number: i.part_number ?? "",
      detail: i.detail ?? "",
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      labour_hours: Number(i.labour_hours) || 0,
      labour_rate: Number(i.labour_rate) || 0,
      discount: Number(i.discount) || 0,
      category: i.category ?? undefined,
      recommendation: i.recommendation ?? "required",
      lead_time_days: Number(i.lead_time_days) || 0,
    }))

  // Active parts requests for this job.
  const { data: parts, error: partsErr } = await supabase
    .from("parts_requests")
    .select("part_name, quantity, cost, notes")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at")
  if (partsErr) throw new Error(partsErr.message)

  const existingPartNames = new Set(
    existingItems.filter((i) => i.kind === "part").map((i) => i.name.trim().toLowerCase()),
  )

  const newParts: QuoteItemInput[] = (parts ?? [])
    .filter(
      (p) =>
        (p.part_name || "").trim() &&
        !existingPartNames.has((p.part_name || "").trim().toLowerCase()) &&
        ![...existingPartNames].some((n) => isSamePart(n, p.part_name)),
    )
    .map((p) => ({
      kind: "part",
      name: p.part_name,
      part_number: "",
      detail: p.notes ?? "",
      quantity: Number(p.quantity) || 1,
      unit_price: Number(p.cost) || 0,
      labour_hours: 0,
      labour_rate: 0,
      discount: 0,
      recommendation: "required",
    }))

  if (newParts.length === 0) {
    // Nothing new to add — surface a clear signal to the caller.
    throw new Error(
      (parts?.length ?? 0) === 0
        ? "There are no parts to send. Add parts first."
        : "All parts are already on the quotation.",
    )
  }

  await saveQuotation(jobId, {
    description: quotation?.description ?? "",
    internalNotes: quotation?.internal_notes ?? "",
    vatRate: Number(quotation?.vat_rate ?? VAT_RATE),
    vatInclusive: Boolean(quotation?.vat_inclusive),
    items: [...existingItems, ...newParts],
  })

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
  await notifyActivity({ title: "Sent for customer approval", link: `/jobs/${jobId}` })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/crm")
}

/* ---------------- Parts ---------------- */
export async function addPart(jobId: string, formData: FormData) {
  const { supabase, ctx } = await requireJobWork(["jobs.update_status", "parts.request"], jobId)
  const partName = String(formData.get("part_name") || "").trim().slice(0, 200)
  if (!partName) throw new Error("Part name is required")
  const quantity = Math.max(1, Math.min(999, Math.round(Number(formData.get("quantity") || 1)) || 1))
  // Only users who may see costs can record supplier/cost; technicians' requests stay price-free.
  const canCost = ctx.permissions.has("costs.view") || ctx.permissions.has("parts.manage")

  // Same part already requested or on the job card (in any wording) — don't double it.
  const [{ data: openReqs }, { data: quote }] = await Promise.all([
    supabase.from("parts_requests").select("part_name, quantity, status").eq("job_id", jobId).is("deleted_at", null),
    supabase
      .from("quotations")
      .select("quotation_items(kind, name, quantity, detail)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const sameName = (n: unknown) => String(n ?? "").trim().toLowerCase() === partName.toLowerCase()
  const dupReq =
    (openReqs ?? []).find((r) => sameName(r.part_name)) ?? bestPartMatch(partName, openReqs ?? [], (r) => r.part_name)
  if (dupReq) {
    throw new Error(
      `"${dupReq.part_name}" (qty ${dupReq.quantity}, ${String(dupReq.status).replace(/_/g, " ")}) is already requested on this job. Update that line instead of adding it again.`,
    )
  }
  // Estimate lines still need buying; only lines already covered by a supplier bill are duplicates.
  const boughtParts = ((quote?.quotation_items as any[]) ?? []).filter(
    (i) => i.kind === "part" && partDocLink(i.detail) === "bill",
  )
  const dupLine = boughtParts.find((i) => sameName(i.name)) ?? bestPartMatch(partName, boughtParts, (i) => i.name)
  if (dupLine) {
    throw new Error(
      `"${dupLine.name}" (qty ${dupLine.quantity}) has already been purchased for this job card. No need to request it again.`,
    )
  }

  const { error } = await supabase.from("parts_requests").insert({
    job_id: jobId,
    part_name: partName,
    quantity,
    supplier: canCost ? String(formData.get("supplier") || "") || null : null,
    cost: canCost && formData.get("cost") ? Number(formData.get("cost")) : null,
    notes: String(formData.get("notes") || "").slice(0, 1000) || null,
    lead_time_days: cleanLeadTime("part", Number(formData.get("lead_time_days") || 0)),
    status: "required",
    requested_by: ctx.userId,
  })
  if (error) throw new Error(error.message)
  const { data: jobRow } = await supabase.from("jobs").select("job_number").eq("id", jobId).maybeSingle()
  await notifyPurchasers({
    title: "Parts required",
    body: `${partName} × ${quantity} needed for job ${jobRow?.job_number ?? jobId.slice(0, 8)}. Get a supplier price.`,
    type: "parts",
    link: `/jobs/${jobId}`,
  })
  await logCurrent("part.request", "job", jobId, { part_name: partName, quantity })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export async function updatePart(partId: string, jobId: string, formData: FormData) {
  const { supabase } = await guard("jobs.update_status")
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (formData.get("status")) patch.status = String(formData.get("status"))
  if (formData.has("supplier")) patch.supplier = String(formData.get("supplier") || "") || null
  if (formData.has("cost")) patch.cost = formData.get("cost") ? Number(formData.get("cost")) : null
  if (formData.has("lead_time_days")) patch.lead_time_days = cleanLeadTime("part", Number(formData.get("lead_time_days") || 0))
  const { data: before } = await supabase.from("parts_requests").select("part_name, quantity, status").eq("id", partId).maybeSingle()
  const { error } = await supabase.from("parts_requests").update(patch).eq("id", partId)
  if (error) throw new Error(error.message)
  if (patch.status === "received" && before && before.status !== "received") {
    await notifyJobTechnicians(jobId, (job) => ({
      title: "Parts ready to fit",
      body: `${before.part_name} × ${before.quantity} has arrived for job ${job}.`,
      type: "parts",
      link: `/jobs/${jobId}`,
    }))
  }
  await logCurrent("part.update", "job", jobId, { status: patch.status ?? null })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export async function deletePart(partId: string, jobId: string) {
  const { supabase, ctx } = await guard("jobs.update_status")
  // Soft delete: archive so it can be restored from the Recycle Bin.
  await supabase
    .from("parts_requests")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
    .eq("id", partId)
  await logAction(ctx, "part_archived", "job", jobId, { partId })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export type ReturnPartResult = { ok: true } | { ok: false; error: string }

/**
 * Record a part coming off a car: sent back to the supplier, or put back into
 * garage stock. Returned parts stop counting toward the car's parts cost. When
 * returned to stock and the part is linked to an inventory item (via the
 * supplier bill line), stock goes back up with an `in` movement.
 */
export async function returnPart(partId: string, jobId: string, formData: FormData): Promise<ReturnPartResult> {
  const { supabase, ctx } = await guard("jobs.update_status")
  const returnTo = String(formData.get("return_to") || "")
  if (returnTo !== "supplier" && returnTo !== "stock") return { ok: false, error: "Choose where the part is going." }
  const reason = String(formData.get("return_reason") || "").trim().slice(0, 500) || null

  const { data: part } = await supabase
    .from("parts_requests")
    .select("id, job_id, part_name, quantity, cost, returned_at, deleted_at")
    .eq("id", partId)
    .maybeSingle()
  if (!part || part.job_id !== jobId || part.deleted_at) return { ok: false, error: "Part not found." }
  if (part.returned_at) return { ok: false, error: "This part is already returned." }

  const maxQty = Number(part.quantity ?? 1) || 1
  const rawQty = Number(formData.get("return_quantity") || maxQty)
  if (!Number.isFinite(rawQty) || rawQty <= 0 || rawQty > maxQty) {
    return { ok: false, error: `Quantity must be between 1 and ${maxQty}.` }
  }

  const { error } = await supabase
    .from("parts_requests")
    .update({
      returned_at: new Date().toISOString(),
      returned_by: ctx.userId,
      return_to: returnTo,
      return_reason: reason,
      return_quantity: rawQty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partId)
  if (error) return { ok: false, error: error.message }

  if (returnTo === "stock") {
    const { data: line } = await supabase
      .from("supplier_invoice_items")
      .select("inventory_item_id, unit_cost")
      .eq("parts_request_id", partId)
      .not("inventory_item_id", "is", null)
      .limit(1)
      .maybeSingle()
    if (line?.inventory_item_id) {
      const { data: job } = await supabase.from("jobs").select("job_number").eq("id", jobId).maybeSingle()
      await supabase.from("stock_movements").insert({
        item_id: line.inventory_item_id,
        kind: "in",
        quantity: rawQty,
        unit_cost: line.unit_cost ?? part.cost ?? null,
        reference: job?.job_number ?? null,
        job_id: jobId,
        note: `Returned from car${reason ? `: ${reason}` : ""}`,
        created_by: ctx.userId,
      })
    }
  }

  await logAction(ctx, "part_returned", "job", jobId, { partId, returnTo, quantity: rawQty })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
  revalidatePath("/inventory")
  return { ok: true }
}

export async function undoReturnPart(partId: string, jobId: string): Promise<ReturnPartResult> {
  const { supabase, ctx } = await guard("jobs.update_status")
  const { data: part } = await supabase
    .from("parts_requests")
    .select("job_id, returned_at, return_to")
    .eq("id", partId)
    .maybeSingle()
  if (!part || part.job_id !== jobId) return { ok: false, error: "Part not found." }
  if (!part.returned_at) return { ok: true }
  if (part.return_to === "stock") {
    return { ok: false, error: "This part was put back into stock. Issue it to the car again from Parts instead." }
  }
  const { error } = await supabase
    .from("parts_requests")
    .update({ returned_at: null, returned_by: null, return_to: null, return_reason: null, return_quantity: null })
    .eq("id", partId)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "part_return_undone", "job", jobId, { partId })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
  return { ok: true }
}

/* ---------------- Auth ---------------- */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/auth/login")
}
