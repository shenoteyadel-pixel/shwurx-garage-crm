"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"

/**
 * Vehicle Inspection (Phase 1).
 *
 * A check-in inspection attached to a job: an interactive damage map (markers
 * pinned to schematic views at x/y percentage coordinates), per-marker photos,
 * odometer/fuel/notes, and a customer signature. All writes are RBAC-guarded
 * and audited. The AI never touches this data — it is human-recorded condition.
 */

async function guard(
  perm: Permission,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; ctx: SessionContext }> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx }
}

export type MarkerView = "top" | "front" | "rear" | "left" | "right"
export type DamageType = "scratch" | "dent" | "paint" | "rust" | "crack" | "other"
export type Severity = "minor" | "moderate" | "severe"

/** Get the job's inspection, creating an empty in_progress one if needed. */
async function getOrCreateInspection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("vehicle_inspections")
    .select("*")
    .eq("job_id", jobId)
    .eq("inspection_type", "check_in")
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from("vehicle_inspections")
    .insert({ job_id: jobId, inspection_type: "check_in", created_by: userId })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return created
}

/** Ensure an inspection row exists for the job and return its id. */
export async function ensureInspection(jobId: string): Promise<string> {
  const { supabase, ctx } = await guard("jobs.edit")
  const inspection = await getOrCreateInspection(supabase, jobId, ctx.userId)
  return inspection.id as string
}

/** Persist the inspection header fields (odometer / fuel / notes). */
export async function saveInspectionDetails(formData: FormData) {
  const { supabase, ctx } = await guard("jobs.edit")
  const jobId = String(formData.get("job_id") || "")
  if (!jobId) throw new Error("Missing job_id")

  const inspection = await getOrCreateInspection(supabase, jobId, ctx.userId)
  const odometerRaw = String(formData.get("odometer") || "").trim()
  const { error } = await supabase
    .from("vehicle_inspections")
    .update({
      odometer: odometerRaw ? Number(odometerRaw) : null,
      fuel_level: String(formData.get("fuel_level") || "") || null,
      general_notes: String(formData.get("general_notes") || "") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inspection.id)
  if (error) throw new Error(error.message)

  await logAction(ctx, "inspection_details_saved", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
}

/** Add a damage marker at a schematic coordinate. */
export async function addInspectionMarker(input: {
  jobId: string
  view: MarkerView
  xPct: number
  yPct: number
  damageType: DamageType
  severity?: Severity | null
  locationLabel?: string | null
  note?: string | null
}) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!input.jobId) throw new Error("Missing job_id")
  const inspection = await getOrCreateInspection(supabase, input.jobId, ctx.userId)

  const { data: max } = await supabase
    .from("inspection_markers")
    .select("position")
    .eq("inspection_id", inspection.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: marker, error } = await supabase
    .from("inspection_markers")
    .insert({
      inspection_id: inspection.id,
      view: input.view,
      x_pct: input.xPct,
      y_pct: input.yPct,
      damage_type: input.damageType,
      severity: input.severity ?? null,
      location_label: input.locationLabel ?? null,
      note: input.note ?? null,
      position: (max?.position ?? -1) + 1,
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  await logAction(ctx, "inspection_marker_added", "job", input.jobId, { view: input.view, type: input.damageType })
  revalidatePath(`/jobs/${input.jobId}`)
  return marker.id as string
}

/** Update an existing marker's condition details. */
export async function updateInspectionMarker(input: {
  jobId: string
  markerId: string
  damageType?: DamageType
  severity?: Severity | null
  locationLabel?: string | null
  note?: string | null
}) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!input.jobId || !input.markerId) throw new Error("Missing marker")

  const patch: Record<string, unknown> = {}
  if (input.damageType !== undefined) patch.damage_type = input.damageType
  if (input.severity !== undefined) patch.severity = input.severity
  if (input.locationLabel !== undefined) patch.location_label = input.locationLabel
  if (input.note !== undefined) patch.note = input.note

  const { error } = await supabase.from("inspection_markers").update(patch).eq("id", input.markerId)
  if (error) throw new Error(error.message)

  await logAction(ctx, "inspection_marker_updated", "job", input.jobId, { markerId: input.markerId })
  revalidatePath(`/jobs/${input.jobId}`)
}

/** Delete a marker (its photos cascade). */
export async function deleteInspectionMarker(jobId: string, markerId: string) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!jobId || !markerId) throw new Error("Missing marker")
  // Soft delete: archive so it can be restored from the Recycle Bin.
  const { error } = await supabase
    .from("inspection_markers")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
    .eq("id", markerId)
  if (error) throw new Error(error.message)
  await logAction(ctx, "inspection_marker_archived", "job", jobId, { markerId })
  revalidatePath(`/jobs/${jobId}`)
}

/** Remove every marker on this job's inspection (scoped clear, not a bulk wipe). */
export async function clearInspectionMarkers(jobId: string) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!jobId) throw new Error("Missing job_id")
  const { data: inspection } = await supabase
    .from("vehicle_inspections")
    .select("id")
    .eq("job_id", jobId)
    .eq("inspection_type", "check_in")
    .maybeSingle()
  if (!inspection) return
  // Soft delete: archive active markers so they can be restored from the Recycle Bin.
  const { error } = await supabase
    .from("inspection_markers")
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
    .eq("inspection_id", inspection.id)
    .is("deleted_at", null)
  if (error) throw new Error(error.message)
  await logAction(ctx, "inspection_markers_cleared", "job", jobId)
  revalidatePath(`/jobs/${jobId}`)
}

/** Attach already-uploaded photo URLs to a marker. */
export async function addMarkerPhotos(jobId: string, markerId: string, urls: string[]) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!markerId || !urls.length) return
  const { error } = await supabase
    .from("inspection_marker_photos")
    .insert(urls.map((url) => ({ marker_id: markerId, url })))
  if (error) throw new Error(error.message)
  await logAction(ctx, "inspection_marker_photos_added", "job", jobId, { markerId, count: urls.length })
  revalidatePath(`/jobs/${jobId}`)
}

/** Remove a single marker photo. */
export async function deleteMarkerPhoto(jobId: string, photoId: string) {
  const { supabase } = await guard("jobs.edit")
  if (!photoId) return
  const { error } = await supabase.from("inspection_marker_photos").delete().eq("id", photoId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

/** Save the customer signature and mark the inspection complete. */
export async function completeInspection(input: {
  jobId: string
  signatureDataUrl?: string | null
  signedByName?: string | null
}) {
  const { supabase, ctx } = await guard("jobs.edit")
  if (!input.jobId) throw new Error("Missing job_id")
  const inspection = await getOrCreateInspection(supabase, input.jobId, ctx.userId)

  const { error } = await supabase
    .from("vehicle_inspections")
    .update({
      status: "completed",
      signature_data_url: input.signatureDataUrl ?? null,
      signed_by_name: input.signedByName ?? null,
      signed_at: input.signatureDataUrl ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inspection.id)
  if (error) throw new Error(error.message)

  await logAction(ctx, "inspection_completed", "job", input.jobId)
  revalidatePath(`/jobs/${input.jobId}`)
}
