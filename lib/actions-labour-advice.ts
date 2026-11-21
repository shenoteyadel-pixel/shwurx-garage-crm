"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/rbac/context"
import { classifyLabour } from "@/lib/labour-report"

const ADVISABLE_DEPARTMENTS = new Set(["programming", "electrical"])

type ItemRow = {
  kind: string
  quantity: number | null
  unit_price: number | null
  labour_hours: number | null
  labour_rate: number | null
  discount: number | null
}

export async function adviseLabourHours(itemId: string, hours: number) {
  await requirePermission("labour.advise")

  const value = Math.round(Number(hours) * 100) / 100
  if (!Number.isFinite(value) || value <= 0 || value > 200) {
    throw new Error("Enter labour hours between 0.25 and 200.")
  }

  // Read through the user's RLS client so only job cards assigned to them resolve.
  const supabase = await createClient()
  const { data: item } = await supabase
    .from("quotation_items")
    .select("id, kind, name, detail, category, addon_type, quotation_id, quotations(id, job_id, vat_rate, vat_inclusive)")
    .eq("id", itemId)
    .maybeSingle()
  const quote = (item as any)?.quotations as { id: string; job_id: string; vat_rate: number | null; vat_inclusive: boolean | null } | null
  if (!item || !quote) throw new Error("This labour line is not on a job card assigned to you.")
  if (item.kind !== "labor" && item.kind !== "service") throw new Error("Only labour lines can be adjusted.")
  if (!ADVISABLE_DEPARTMENTS.has(classifyLabour(item.category, item.name, item.detail, item.addon_type))) {
    throw new Error("You can only adjust programming and electrical labour.")
  }

  const { data: job } = await supabase.from("jobs").select("id, approval_status").eq("id", quote.job_id).maybeSingle()
  if (!job) throw new Error("This labour line is not on a job card assigned to you.")
  if (job.approval_status === "approved") {
    throw new Error("The customer already approved this quotation. Ask the service advisor to change the hours.")
  }

  const admin = createServiceClient()
  const { error: updateError } = await admin.from("quotation_items").update({ labour_hours: value }).eq("id", itemId)
  if (updateError) throw new Error(updateError.message)

  // Keep the stored quotation totals in step, using the same maths as saveQuotation.
  const { data: rows } = await admin
    .from("quotation_items")
    .select("kind, quantity, unit_price, labour_hours, labour_rate, discount")
    .eq("quotation_id", quote.id)
  const vatRate = Number(quote.vat_rate ?? 5)
  const vatInclusive = Boolean(quote.vat_inclusive)
  let partsTotal = 0
  let laborTotal = 0
  let discountTotal = 0
  let vatAmount = 0
  for (const r of (rows ?? []) as ItemRow[]) {
    const isLabour = r.kind === "labor" || r.kind === "service"
    const h = Number(r.labour_hours) || 0
    const rate = Number(r.labour_rate) || 0
    const discount = Number(r.discount) || 0
    const gross = isLabour ? (h > 0 ? h * rate : rate) : (Number(r.quantity) || 0) * (Number(r.unit_price) || 0)
    const base = Math.max(0, gross - discount)
    const net = vatInclusive ? base / (1 + vatRate / 100) : base
    const vat = vatInclusive ? base - net : (base * vatRate) / 100
    if (isLabour) laborTotal += vatInclusive ? net : gross
    else partsTotal += vatInclusive ? net : gross
    discountTotal += discount
    vatAmount += vat
  }
  const subtotal = vatInclusive ? partsTotal + laborTotal : partsTotal + laborTotal - discountTotal
  await admin
    .from("quotations")
    .update({
      parts_total: partsTotal,
      labor_total: laborTotal,
      discount_total: discountTotal,
      subtotal,
      vat_amount: vatAmount,
      total: subtotal + vatAmount,
    })
    .eq("id", quote.id)

  revalidatePath(`/jobs/${quote.job_id}`)
  return { ok: true as const, hours: value }
}
