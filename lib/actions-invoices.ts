"use server"

import { createClient } from "@/lib/supabase/server"
import { put, del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"
import { getSettings } from "@/lib/settings"
import { extractInvoice } from "@/lib/invoice-ocr"
import { suggestSalePrice } from "@/lib/pricing"

async function guard(perm: Permission): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  ctx: SessionContext
  userId: string
}> {
  const ctx = await requirePermission(perm)
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

/* ============================================================
   1. Upload + OCR -> create a DRAFT supplier invoice
   ============================================================ */
export type ExtractResult = { ok: true; id: string } | { ok: false; error: string }

export async function extractAndCreateInvoice(formData: FormData): Promise<ExtractResult> {
  const { supabase, ctx, userId } = await guard("purchase_orders.manage")

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file provided" }
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "File is larger than 20MB" }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = file.name.split(".").pop() || "bin"
  const pathname = `supplier-invoices/${crypto.randomUUID()}.${ext}`

  // Store the original permanently (private) so it's always viewable/auditable.
  let blobPathname: string
  try {
    const blob = await put(pathname, file, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    })
    blobPathname = blob.pathname
  } catch (e) {
    console.error("[v0] invoice blob upload failed:", e)
    return { ok: false, error: "Could not store the uploaded file" }
  }

  const settings = await getSettings()

  // OCR is best-effort: a failure still yields an editable draft with the file.
  let extracted: Awaited<ReturnType<typeof extractInvoice>> | null = null
  try {
    extracted = await extractInvoice(bytes, file.type || "image/jpeg")
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
      vat_amount: n(extracted?.vat_amount),
      total: n(extracted?.total),
      status: "draft",
      blob_pathname: blobPathname,
      file_type: file.type || null,
      ocr_confidence: extracted?.confidence ?? null,
      ocr_raw: extracted ? (extracted as unknown as Record<string, unknown>) : null,
      created_by: userId,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  const lines = extracted?.line_items ?? []
  if (lines.length) {
    // OEM-first auto-match: a line links to an existing part ONLY when its OEM
    // number matches exactly one inventory item. Supplier numbers and
    // descriptions are never used to auto-link — the review UI flags those as
    // "possible matches" for a human to confirm.
    const oemIndex = await buildOemIndex(supabase)
    await supabase.from("supplier_invoice_items").insert(
      lines.map((l, i) => {
        const unitCost = n(l.unit_cost)
        const oem = l.oem_part_number?.trim() || null
        const supplierPn = l.supplier_part_number?.trim() || null
        const matchId = oem ? oemIndex.get(normPartNumber(oem)) : undefined
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
          markup_pct: settings.default_markup_pct,
          suggested_sale_price: suggestSalePrice(unitCost, settings.pricing_method, settings.default_markup_pct),
          confidence: l.confidence ?? null,
        }
      }),
    )
  }

  await logAction(ctx, "supplier_invoice_captured", "supplier_invoice", inv.id)
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
  suggested_sale_price: number
  markup_pct: number
}

export async function saveInvoiceDraft(payload: {
  id: string
  supplierId: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  notes: string | null
  lines: DraftLine[]
}) {
  const { supabase } = await guard("purchase_orders.manage")

  const clean = payload.lines.filter((l) => (l.description || "").trim())
  const subtotal = clean.reduce((t, l) => t + n(l.quantity) * n(l.unit_cost), 0)
  const vat = clean.reduce((t, l) => t + (n(l.quantity) * n(l.unit_cost) * n(l.vat_rate)) / 100, 0)
  const total = subtotal + vat

  const { error: headErr } = await supabase
    .from("supplier_invoices")
    .update({
      supplier_id: payload.supplierId,
      invoice_number: payload.invoiceNumber,
      invoice_date: payload.invoiceDate || null,
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
          suggested_sale_price: n(l.suggested_sale_price),
          markup_pct: n(l.markup_pct),
        }
      }),
    )
    if (itemErr) throw new Error(itemErr.message)
  }
  revalidatePath(`/purchasing/invoices/${payload.id}`)
}

/* ============================================================
   3. Confirm -> post to inventory, stock movements, ledger
   ============================================================ */
export async function confirmSupplierInvoice(id: string) {
  const { supabase, ctx, userId } = await guard("purchase_orders.manage")

  const { data: invoice, error: invErr } = await supabase
    .from("supplier_invoices")
    .select("id, status, supplier_id, invoice_number, total")
    .eq("id", id)
    .single()
  if (invErr) throw new Error(invErr.message)
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be confirmed")
  if (!invoice.supplier_id) throw new Error("Assign a supplier before confirming")

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
      created_by: userId,
    })
  }

  const { data: docNum } = await supabase.rpc("next_doc_number", { p_type: "sinv", p_prefix: "SINV" })

  const { error: updErr } = await supabase
    .from("supplier_invoices")
    .update({
      status: "confirmed",
      doc_number: docNum || `SINV-${Date.now()}`,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (updErr) throw new Error(updErr.message)

  await logAction(ctx, "supplier_invoice_confirmed", "supplier_invoice", id)
  revalidatePath(`/purchasing/invoices/${id}`)
  revalidatePath("/purchasing/invoices")
  revalidatePath("/inventory")
  revalidatePath("/suppliers")
}

/* ============================================================
   4. Record a payment against a confirmed invoice
   ============================================================ */
export async function recordSupplierInvoicePayment(id: string, formData: FormData) {
  const { supabase, userId } = await guard("purchase_orders.manage")
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
}

/* ============================================================
   5. Delete a draft (removes stored original)
   ============================================================ */
export async function deleteInvoiceDraft(id: string) {
  const { supabase, ctx } = await guard("purchase_orders.manage")
  const { data: invoice } = await supabase.from("supplier_invoices").select("status, blob_pathname").eq("id", id).single()
  if (!invoice) return
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
}
