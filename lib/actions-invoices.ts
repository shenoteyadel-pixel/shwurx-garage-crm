"use server"

import { createClient } from "@/lib/supabase/server"
import { get, del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { requireAnyPermission, logAction, ForbiddenError, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"
import { getSettings } from "@/lib/settings"
import { extractInvoice } from "@/lib/invoice-ocr"
import { suggestSalePrice } from "@/lib/pricing"

// Both purchasing managers and parts staff capture and receive supplier
// invoices, matching the nav, layout and dashboard buttons.
const INVOICE_PERMS: Permission[] = ["purchase_orders.manage", "parts.view"]

/**
 * Result contract for mutating invoice actions. We deliberately RETURN errors
 * instead of throwing: a thrown Server Action error is redacted by Next.js in
 * production into the opaque "Minified React error #441", which hides the real
 * cause from staff. Returning a plain object is always serializable and lets
 * the UI show the actual message.
 */
export type InvoiceActionResult = { ok: true } | { ok: false; error: string }

/** Turn any caught value into a human-readable message (never leaks #441). */
function toActionError(e: unknown, fallback: string): { ok: false; error: string } {
  const msg =
    e instanceof ForbiddenError
      ? "You do not have permission to do this."
      : e instanceof Error && e.message
        ? e.message
        : fallback
  console.error(`[v0] invoice action failed: ${msg}`)
  return { ok: false, error: msg }
}

async function guard(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  ctx: SessionContext
  userId: string
}> {
  const ctx = await requireAnyPermission(INVOICE_PERMS)
  const supabase = await createClient()
  return { supabase, ctx, userId: ctx.userId }
}

const n = (v: unknown, d = 0) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const s = (v: FormDataEntryValue | null) => (v ? String(v) : "") || null

/** Normalize a part number for matching: case- and separator-insensitive. */
const normPartNumber = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Build an OEM-number -> inventory-item-id index for auto-matching. An OEM
 * number that maps to more than one part is treated as ambiguous and dropped,
 * so it falls back to manual review rather than linking to the wrong part.
 */
async function buildOemIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("inventory_items")
    .select("id, oem_part_number")
    .is("deleted_at", null)
    .not("oem_part_number", "is", null)
  const map = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const it of data ?? []) {
    const key = normPartNumber(String(it.oem_part_number ?? ""))
    if (!key) continue
    if (map.has(key)) {
      ambiguous.add(key)
      continue
    }
    map.set(key, it.id as string)
  }
  for (const k of ambiguous) map.delete(k)
  return map
}

type OpenPartsRequest = {
  id: string
  job_id: string
  part_name: string
  job_number: string | null
  vehicle: string | null
}

/**
 * Load open parts requests (awaiting supply) with their job/vehicle, so a
 * scanned line can be auto-suggested against the job that already asked for it.
 */
async function loadOpenPartsRequests(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<OpenPartsRequest[]> {
  const { data } = await supabase
    .from("parts_requests")
    .select("id, job_id, part_name, status, jobs(job_number, vehicle_make, vehicle_model, plate_number)")
    .is("deleted_at", null)
    .not("status", "in", "(received,cancelled)")
  return (data ?? []).map((r) => {
    const job = (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) as
      | { job_number?: string; vehicle_make?: string; vehicle_model?: string; plate_number?: string }
      | null
    return {
      id: r.id as string,
      job_id: r.job_id as string,
      part_name: String(r.part_name ?? ""),
      job_number: job?.job_number ?? null,
      vehicle: [job?.vehicle_make, job?.vehicle_model].filter(Boolean).join(" ") || job?.plate_number || null,
    }
  })
}

/** Loose word-overlap match between a scanned line and a requested part name. */
function suggestPartsRequest(
  description: string,
  oem: string | null,
  requests: OpenPartsRequest[],
): OpenPartsRequest | null {
  const hay = normPartNumber(description + " " + (oem ?? ""))
  for (const r of requests) {
    const key = normPartNumber(r.part_name)
    if (key.length >= 4 && (hay.includes(key) || key.includes(normPartNumber(description)))) return r
  }
  return null
}

/* ============================================================
   1. Upload + OCR -> create a DRAFT supplier invoice
   ============================================================ */
export type ExtractResult = { ok: true; id: string } | { ok: false; error: string }

export type UploadedInvoiceInput = {
  pathname: string
  contentType?: string | null
  fileName?: string | null
}

export async function extractAndCreateInvoice(input: UploadedInvoiceInput): Promise<ExtractResult> {
  // A server action that THROWS is surfaced to the browser as an opaque
  // "Minified React error #441" with no detail. Catch everything here and
  // return a readable message so the upload UI can show the real reason
  // instead of a cryptic React error.
  try {
    return await runExtractAndCreateInvoice(input)
  } catch (e) {
    console.error("[v0] extractAndCreateInvoice failed:", e)
    const message =
      e instanceof ForbiddenError
        ? e.message
        : e instanceof Error && e.message
          ? e.message
          : "Something went wrong while saving the invoice. Please try again."
    return { ok: false, error: message }
  }
}

async function runExtractAndCreateInvoice(input: UploadedInvoiceInput): Promise<ExtractResult> {
  const { supabase, ctx, userId } = await guard()

  // The browser already uploaded the original scan/PDF DIRECTLY to Vercel Blob
  // (private) and passes us only its pathname. This bypasses the ~4.5MB request
  // body limit on serverless Server Actions — a phone photo of an invoice is
  // usually several MB and was rejected before the action even ran, surfacing
  // as an opaque "React error #441".
  const blobPathname = input?.pathname
  if (!blobPathname) return { ok: false, error: "No file provided" }

  // Read the uploaded file back for OCR.
  let bytes: Uint8Array
  let contentType = input.contentType || "image/jpeg"
  try {
    const stored = await get(blobPathname, { access: "private" })
    if (!stored) return { ok: false, error: "Uploaded file could not be found" }
    contentType = stored.blob.contentType || contentType
    bytes = new Uint8Array(await new Response(stored.stream).arrayBuffer())
  } catch (e) {
    console.error("[v0] reading uploaded invoice blob failed:", e)
    return { ok: false, error: "Could not read the uploaded file" }
  }

  const settings = await getSettings()

  // OCR is best-effort: a failure still yields an editable draft with the file.
  let extracted: Awaited<ReturnType<typeof extractInvoice>> | null = null
  try {
    extracted = await extractInvoice(bytes, contentType)
  } catch (e) {
    console.error("[v0] invoice OCR failed:", e)
  }

  // Try to match the supplier by name.
  let supplierId: string | null = null
  if (extracted?.supplier_name) {
    const { data: match } = await supabase
      .from("suppliers")
      .select("id")
      .is("deleted_at", null)
      .ilike("name", `%${extracted.supplier_name.trim()}%`)
      .limit(1)
      .maybeSingle()
    supplierId = match?.id ?? null
  }

  const { data: inv, error } = await supabase
    .from("supplier_invoices")
    .insert({
      supplier_id: supplierId,
      supplier_name_raw: extracted?.supplier_name ?? null,
      invoice_number: extracted?.invoice_number ?? null,
      invoice_date: normalizeDate(extracted?.invoice_date),
      currency: extracted?.currency || "AED",
      subtotal: n(extracted?.subtotal),
      discount_amount: n(extracted?.discount_amount),
      vat_amount: n(extracted?.vat_amount),
      total: n(extracted?.total),
      status: "draft",
      blob_pathname: blobPathname,
      file_type: contentType || null,
      ocr_confidence: extracted?.confidence ?? null,
      ocr_raw: extracted ? (extracted as unknown as Record<string, unknown>) : null,
      created_by: userId,
    })
    .select("id")
    .single()
  if (error) {
    // The row was rejected (e.g. RLS/permissions/schema) — don't leave the
    // uploaded file orphaned in blob storage.
    try {
      await del(blobPathname)
    } catch (e) {
      console.error("[v0] failed to clean up orphaned invoice blob:", e)
    }
    return { ok: false, error: error.message }
  }

  // The draft row now exists and is fully editable in the review UI. Every
  // step below (OEM auto-matching, line-item insert, audit log) is best-effort
  // enrichment — if any of it fails it must NOT fail the upload and strand the
  // user, since the draft is already saved.
  try {
  const lines = extracted?.line_items ?? []
  if (lines.length) {
    // OEM-first auto-match: a line links to an existing part ONLY when its OEM
    // number matches exactly one inventory item. Supplier numbers and
    // descriptions are never used to auto-link — the review UI flags those as
    // "possible matches" for a human to confirm.
    const oemIndex = await buildOemIndex(supabase)
    const openRequests = await loadOpenPartsRequests(supabase)
    await supabase.from("supplier_invoice_items").insert(
      lines.map((l, i) => {
        const unitCost = n(l.unit_cost)
        const oem = l.oem_part_number?.trim() || null
        const supplierPn = l.supplier_part_number?.trim() || null
        const matchId = oem ? oemIndex.get(normPartNumber(oem)) : undefined
        const pr = suggestPartsRequest(l.description || "", oem, openRequests)
        return {
          invoice_id: inv.id,
          line_no: i + 1,
          description: l.description || "Item",
          sku: oem ?? supplierPn,
          oem_part_number: oem,
          supplier_part_number: supplierPn,
          quantity: n(l.quantity, 1),
          unit: l.unit || "pcs",
          unit_cost: unitCost,
          line_total: n(l.line_total, unitCost * n(l.quantity, 1)),
          vat_rate: settings.vat_rate,
          inventory_item_id: matchId ?? null,
          match_status: matchId ? "matched" : "new",
          job_id: pr?.job_id ?? null,
          parts_request_id: pr?.id ?? null,
          markup_pct: settings.default_markup_pct,
          suggested_sale_price: suggestSalePrice(unitCost, settings.pricing_method, settings.default_markup_pct),
          confidence: l.confidence ?? null,
        }
      }),
    )
  }

    await logAction(ctx, "supplier_invoice_captured", "supplier_invoice", inv.id)
  } catch (e) {
    // Draft is already created and editable — never fail the upload for an
    // enrichment error.
    console.error("[v0] invoice enrichment failed (draft still created):", e)
  }

  revalidatePath("/purchasing/invoices")
  return { ok: true, id: inv.id }
}

function normalizeDate(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/* ============================================================
   2. Save edits to a draft (header + replace line items)
   ============================================================ */
export type DraftLine = {
  description: string
  oem_part_number: string | null
  supplier_part_number: string | null
  quantity: number
  unit: string
  unit_cost: number
  vat_rate: number
  inventory_item_id: string | null
  match_status: "new" | "matched" | "ignore"
  job_id: string | null
  parts_request_id: string | null
  suggested_sale_price: number
  markup_pct: number
}

export type SaveDraftPayload = {
  id: string
  supplierId: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  discountAmount: number
  notes: string | null
  lines: DraftLine[]
}

/**
 * Core draft-save DB logic. Takes an already-guarded client and does NOT
 * revalidate — the exported wrappers own guarding and cache revalidation so
 * this can be reused by the combined save+confirm action. Throws on failure.
 */
async function applyDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: SaveDraftPayload,
): Promise<void> {
  const clean = payload.lines.filter((l) => (l.description || "").trim())
  const subtotal = clean.reduce((t, l) => t + n(l.quantity) * n(l.unit_cost), 0)
  const vat = clean.reduce((t, l) => t + (n(l.quantity) * n(l.unit_cost) * n(l.vat_rate)) / 100, 0)
  const discount = n(payload.discountAmount)
  const total = subtotal - discount + vat

  const { error: headErr } = await supabase
    .from("supplier_invoices")
    .update({
      supplier_id: payload.supplierId,
      invoice_number: payload.invoiceNumber,
      invoice_date: payload.invoiceDate || null,
      discount_amount: discount,
      notes: payload.notes,
      subtotal,
      vat_amount: vat,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.id)
    .eq("status", "draft")
  if (headErr) throw new Error(headErr.message)

  await supabase.from("supplier_invoice_items").delete().eq("invoice_id", payload.id)
  if (clean.length) {
    const { error: itemErr } = await supabase.from("supplier_invoice_items").insert(
      clean.map((l, i) => {
        const oem = l.oem_part_number?.trim() || null
        const supplierPn = l.supplier_part_number?.trim() || null
        return {
          invoice_id: payload.id,
          line_no: i + 1,
          description: l.description,
          sku: oem ?? supplierPn,
          oem_part_number: oem,
          supplier_part_number: supplierPn,
          quantity: n(l.quantity, 1),
          unit: l.unit || "pcs",
          unit_cost: n(l.unit_cost),
          line_total: n(l.quantity, 1) * n(l.unit_cost),
          vat_rate: n(l.vat_rate, 5),
          inventory_item_id: l.inventory_item_id,
          match_status: l.match_status,
          job_id: l.job_id,
          parts_request_id: l.parts_request_id,
          suggested_sale_price: n(l.suggested_sale_price),
          markup_pct: n(l.markup_pct),
        }
      }),
    )
    if (itemErr) throw new Error(itemErr.message)
  }
}

/**
 * Save edits to a draft (exported wrapper: guard + apply + single revalidate).
 * Used by the standalone "Save draft" button.
 */
export async function saveInvoiceDraft(payload: SaveDraftPayload): Promise<InvoiceActionResult> {
  try {
    const { supabase } = await guard()
    await applyDraft(supabase, payload)
    revalidatePath(`/purchasing/invoices/${payload.id}`)
    revalidatePath("/purchasing/invoices")
    return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not save the invoice draft.")
  }
}

/* ============================================================
   3. Confirm -> post to inventory, stock movements, ledger
   ============================================================ */
/**
 * Core confirm DB logic. Takes an already-guarded client and does NOT
 * revalidate — the exported wrappers own guarding and cache revalidation so
 * this can be reused by the combined save+confirm action. Throws on failure.
 */
async function applyConfirm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: SessionContext,
  userId: string,
  id: string,
): Promise<void> {
  const { data: invoice, error: invErr } = await supabase
    .from("supplier_invoices")
    .select("id, status, supplier_id, supplier_name_raw, invoice_number, total, ocr_raw")
    .eq("id", id)
    .single()
  if (invErr) throw new Error(invErr.message)
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be confirmed")

  // Auto-fill the Suppliers module: create a supplier from the scanned details
  // when none was matched, or backfill any missing contact fields on the matched
  // supplier (never overwriting values a human already entered).
  const raw = (invoice.ocr_raw ?? {}) as Record<string, unknown>
  const rawStr = (k: string) => {
    const v = raw[k]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }
  let supplierId = invoice.supplier_id as string | null
  if (!supplierId) {
    const name = (invoice.supplier_name_raw as string | null)?.trim() || rawStr("supplier_name") || "Unknown supplier"
    const { data: created, error: supErr } = await supabase
      .from("suppliers")
      .insert({
        name,
        trn: rawStr("supplier_trn"),
        mobile: rawStr("supplier_phone"),
        email: rawStr("supplier_email"),
        address: rawStr("supplier_address"),
        created_by: userId,
      })
      .select("id")
      .single()
    if (supErr) throw new Error(supErr.message)
    supplierId = created.id
    await supabase.from("supplier_invoices").update({ supplier_id: supplierId }).eq("id", id)
  } else {
    const { data: sup } = await supabase
      .from("suppliers")
      .select("trn, mobile, email, address")
      .eq("id", supplierId)
      .single()
    const backfill: Record<string, string> = {}
    if (!sup?.trn && rawStr("supplier_trn")) backfill.trn = rawStr("supplier_trn")!
    if (!sup?.mobile && rawStr("supplier_phone")) backfill.mobile = rawStr("supplier_phone")!
    if (!sup?.email && rawStr("supplier_email")) backfill.email = rawStr("supplier_email")!
    if (!sup?.address && rawStr("supplier_address")) backfill.address = rawStr("supplier_address")!
    if (Object.keys(backfill).length) await supabase.from("suppliers").update(backfill).eq("id", supplierId)
  }
  invoice.supplier_id = supplierId

  const { data: items } = await supabase
    .from("supplier_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no")

  const reference = invoice.invoice_number ? `Bill ${invoice.invoice_number}` : "Supplier invoice"

  for (const it of items ?? []) {
    if (it.match_status === "ignore") continue
    const qty = n(it.quantity)
    if (qty <= 0) continue
    const cost = n(it.unit_cost)
    const sale = n(it.suggested_sale_price)

    let itemId = it.inventory_item_id as string | null

    if (itemId) {
      // Existing part: top up stock, refresh cost and (if provided) sale price.
      // Backfill OEM / supplier numbers ONLY when the part lacks them — never
      // overwrite an existing OEM number, and never touch the CRM Part ID.
      const { data: cur } = await supabase
        .from("inventory_items")
        .select("quantity, oem_part_number, supplier_part_number")
        .eq("id", itemId)
        .single()
      const nextQty = (n(cur?.quantity) || 0) + qty
      await supabase
        .from("inventory_items")
        .update({
          quantity: nextQty,
          cost_price: cost,
          ...(sale > 0 ? { sale_price: sale } : {}),
          ...(!cur?.oem_part_number && it.oem_part_number ? { oem_part_number: it.oem_part_number } : {}),
          ...(!cur?.supplier_part_number && it.supplier_part_number
            ? { supplier_part_number: it.supplier_part_number }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
    } else {
      // New part: create the inventory record with opening quantity. The CRM
      // Part ID is assigned automatically by a DB trigger (SHW-P-######).
      const { data: created, error: createErr } = await supabase
        .from("inventory_items")
        .insert({
          sku: it.oem_part_number ?? it.supplier_part_number ?? it.sku,
          name: it.description || "Part",
          oem_part_number: it.oem_part_number ?? null,
          supplier_part_number: it.supplier_part_number ?? null,
          unit: it.unit || "pcs",
          cost_price: cost,
          sale_price: sale,
          quantity: qty,
          supplier_id: invoice.supplier_id,
        })
        .select("id")
        .single()
      if (createErr) throw new Error(createErr.message)
      itemId = created.id
      await supabase.from("supplier_invoice_items").update({ inventory_item_id: itemId, match_status: "matched" }).eq("id", it.id)
    }

    await supabase.from("stock_movements").insert({
      item_id: itemId,
      kind: "in",
      quantity: qty,
      unit_cost: cost,
      reference,
      job_id: it.job_id ?? null,
      supplier_id: invoice.supplier_id,
      created_by: userId,
    })

    // Close the loop on the job card: mark the originating parts request as
    // received and record what it actually cost.
    if (it.parts_request_id) {
      await supabase
        .from("parts_requests")
        .update({ status: "received", cost, updated_at: new Date().toISOString() })
        .eq("id", it.parts_request_id)
    }
  }

  const { data: docNum } = await supabase.rpc("next_doc_number", { p_type: "sinv", p_prefix: "SINV" })

  const { error: updErr } = await supabase
    .from("supplier_invoices")
    .update({
      status: "confirmed",
      doc_number: docNum || `SINV-${Date.now()}`,
      payment_status: "unpaid",
      amount_paid: 0,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (updErr) throw new Error(updErr.message)

  await logAction(ctx, "supplier_invoice_confirmed", "supplier_invoice", id)
}

/** Revalidate every surface a confirmed invoice touches. */
function revalidateConfirm(id: string): void {
  revalidatePath(`/purchasing/invoices/${id}`)
  revalidatePath("/purchasing/invoices")
  revalidatePath("/inventory")
  revalidatePath("/suppliers")
  revalidatePath("/parts")
}

/** Confirm an already-saved draft (standalone confirm button). */
export async function confirmSupplierInvoice(id: string): Promise<InvoiceActionResult> {
  try {
    const { supabase, ctx, userId } = await guard()
    await applyConfirm(supabase, ctx, userId, id)
    revalidateConfirm(id)
    return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not confirm the invoice.")
  }
}

/**
 * Save the user's latest edits AND confirm in ONE server action. The review UI
 * calls this instead of awaiting saveInvoiceDraft() and then
 * confirmSupplierInvoice() as two separate actions. The two-call approach ran a
 * revalidatePath() re-render BETWEEN the save and the confirm; if that mid-flow
 * re-render threw, Next.js rejected the save action with an opaque
 * "Server Components render" error (the minified #441) and the confirm step
 * never ran — leaving the draft half-saved and never confirmed. Doing both
 * inside one action means a single trailing revalidation, so confirm always
 * runs on the freshly-saved data and any real failure returns a readable error.
 */
export async function saveAndConfirmSupplierInvoice(payload: SaveDraftPayload): Promise<InvoiceActionResult> {
  try {
    const { supabase, ctx, userId } = await guard()
    await applyDraft(supabase, payload)
    await applyConfirm(supabase, ctx, userId, payload.id)
    revalidateConfirm(payload.id)
    return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not confirm the invoice.")
  }
}

/* ============================================================
   4. Record a payment against a confirmed invoice
   ============================================================ */
export async function recordSupplierInvoicePayment(id: string, formData: FormData): Promise<InvoiceActionResult> {
  try {
  const { supabase, userId } = await guard()
  const amount = n(formData.get("amount"))
  if (amount <= 0) throw new Error("Enter a positive amount")

  const { data: invoice } = await supabase.from("supplier_invoices").select("total, status").eq("id", id).single()
  if (!invoice || invoice.status !== "confirmed") throw new Error("Invoice is not confirmed")

  await supabase.from("payments").insert({
    direction: "out",
    supplier_invoice_id: id,
    amount,
    method: s(formData.get("method")) || "cash",
    reference: s(formData.get("reference")),
    paid_at: s(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
    note: s(formData.get("note")),
    created_by: userId,
  })

  const { data: paidRows } = await supabase.from("payments").select("amount").eq("supplier_invoice_id", id)
  const paid = (paidRows ?? []).reduce((t, p) => t + n(p.amount), 0)
  const total = n(invoice.total)
  const status = paid <= 0 ? "unpaid" : paid + 0.01 >= total ? "paid" : "partial"

  await supabase
    .from("supplier_invoices")
    .update({ amount_paid: paid, payment_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)

  revalidatePath(`/purchasing/invoices/${id}`)
  revalidatePath("/suppliers")
  return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not record the payment.")
  }
}

/**
 * Flag a confirmed invoice as on-account / credit (bought on the supplier's
 * credit terms, not yet paid). Toggles back to unpaid if undone.
 */
export async function setSupplierInvoiceOnAccount(id: string, onAccount: boolean): Promise<InvoiceActionResult> {
  try {
  const { supabase } = await guard()
  const { data: invoice } = await supabase.from("supplier_invoices").select("status, amount_paid, total").eq("id", id).single()
  if (!invoice || invoice.status !== "confirmed") throw new Error("Invoice is not confirmed")
  const paid = n(invoice.amount_paid)
  const total = n(invoice.total)
  const status = onAccount ? "credit" : paid <= 0 ? "unpaid" : paid + 0.01 >= total ? "paid" : "partial"
  await supabase
    .from("supplier_invoices")
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)
  revalidatePath(`/purchasing/invoices/${id}`)
  revalidatePath("/suppliers")
  return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not update the invoice.")
  }
}

/* ============================================================
   6. Delete a draft (removes stored original)
   ============================================================ */
export async function deleteInvoiceDraft(id: string): Promise<InvoiceActionResult> {
  try {
  const { supabase, ctx } = await guard()
  const { data: invoice } = await supabase.from("supplier_invoices").select("status, blob_pathname").eq("id", id).single()
  if (!invoice) return { ok: true }
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be deleted")

  if (invoice.blob_pathname) {
    try {
      await del(invoice.blob_pathname)
    } catch (e) {
      console.error("[v0] blob delete failed:", e)
    }
  }
  await supabase.from("supplier_invoices").delete().eq("id", id)
  await logAction(ctx, "supplier_invoice_deleted", "supplier_invoice", id)
  revalidatePath("/purchasing/invoices")
  return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not delete the draft.")
  }
}
