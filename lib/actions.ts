"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { VAT_RATE, type Stage } from "@/lib/constants"

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  return { supabase, user }
}

function genJobNumber() {
  const d = new Date()
  const y = String(d.getFullYear()).slice(2)
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `SW-${y}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`
}

/* ---------------- Jobs ---------------- */
export async function createJob(formData: FormData) {
  const { supabase, user } = await requireUser()

  const payload = {
    job_number: genJobNumber(),
    customer_name: String(formData.get("customer_name") || ""),
    customer_mobile: String(formData.get("customer_mobile") || ""),
    vehicle_make: String(formData.get("vehicle_make") || "") || null,
    vehicle_model: String(formData.get("vehicle_model") || "") || null,
    vehicle_year: formData.get("vehicle_year") ? Number(formData.get("vehicle_year")) : null,
    plate_number: String(formData.get("plate_number") || "") || null,
    vin: String(formData.get("vin") || "") || null,
    mileage: formData.get("mileage") ? Number(formData.get("mileage")) : null,
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

  revalidatePath("/")
  redirect(`/jobs/${data.id}`)
}

export async function updateStage(jobId: string, stage: Stage) {
  const { supabase } = await requireUser()
  const { error } = await supabase
    .from("jobs")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  revalidatePath("/")
  revalidatePath(`/jobs/${jobId}`)
}

export async function assignStaff(jobId: string, field: "advisor_id" | "technician_id", value: string) {
  const { supabase } = await requireUser()
  const { error } = await supabase
    .from("jobs")
    .update({ [field]: value || null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function addPhotos(jobId: string, urls: string[], kind: "vehicle" | "damage") {
  const { supabase } = await requireUser()
  if (!urls.length) return
  const { error } = await supabase
    .from("vehicle_photos")
    .insert(urls.map((url) => ({ job_id: jobId, url, kind })))
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function deletePhoto(photoId: string, jobId: string) {
  const { supabase } = await requireUser()
  await supabase.from("vehicle_photos").delete().eq("id", photoId)
  revalidatePath(`/jobs/${jobId}`)
}

/* ---------------- Quotation ---------------- */
export type QuoteItemInput = {
  kind: "part" | "labor" | "service"
  name: string
  detail: string
  quantity: number
  unit_price: number
  labor: number
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
  const { supabase } = await requireUser()

  const vatRate = Number.isFinite(payload.vatRate) ? payload.vatRate : VAT_RATE
  const items = payload.items

  // Per-line computation
  const computed = items.map((i) => {
    const qty = Number(i.quantity) || 0
    const unit = Number(i.unit_price) || 0
    const labor = Number(i.labor) || 0
    const discount = Number(i.discount) || 0
    const base = Math.max(0, qty * unit + labor - discount)
    const vat = (base * vatRate) / 100
    return { ...i, quantity: qty, unit_price: unit, labor, discount, base, vat, line_total: base + vat }
  })

  const partsTotal = computed.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const laborTotal = computed.reduce((s, i) => s + i.labor, 0)
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
        detail: i.detail || null,
        description: i.name || null, // keep legacy column populated
        quantity: i.quantity,
        unit_price: i.unit_price,
        labor: i.labor,
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
  const { supabase } = await requireUser()
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
  const { supabase } = await requireUser()
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
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/parts")
}

export async function updatePart(partId: string, jobId: string, formData: FormData) {
  const { supabase } = await requireUser()
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
  const { supabase } = await requireUser()
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
