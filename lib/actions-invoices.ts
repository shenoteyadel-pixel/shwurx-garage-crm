"use server"

import { logCurrent } from "@/lib/rbac/context"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { findDuplicateGroups } from "@/lib/invoice-duplicates"
import { get, del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { requireAnyPermission, logAction, ForbiddenError, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"
import { getSettings } from "@/lib/settings"
import { notifyActivity } from "@/lib/activity"
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

/** What a confirm actually wrote — shown to the user as a receipt. */
export type ConfirmSummary = {
  supplierId: string
  supplierName: string
  supplierCreated: boolean
  parts: {
    inventoryItemId: string
    name: string
    quantity: number
    created: boolean
    jobId: string | null
    crmPartId: string | null
    oemNumber: string | null
    salePrice: number
  }[]
}

export type ConfirmResult = { ok: true; summary: ConfirmSummary } | { ok: false; error: string }

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
const uuidOrNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

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
    .neq("status", "received")
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

type DuplicateInvoice = { id: string; label: string; status: string }

const normName = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Find an existing (non-deleted) supplier invoice that is the same document:
 * an identical file, or the same invoice number from the same supplier (or
 * with the same total when the supplier is unknown on either side).
 */
async function findDuplicateInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    excludeId?: string
    fileHash?: string | null
    invoiceNumber?: string | null
    supplierId?: string | null
    supplierName?: string | null
    total?: number | null
    onlyConfirmed?: boolean
  },
): Promise<DuplicateInvoice | null> {
  const toDup = (r: { id: string; doc_number: string | null; invoice_number: string | null; status: string }) => ({
    id: r.id,
    label: r.doc_number || r.invoice_number || "an earlier upload",
    status: r.status,
  })

  if (opts.fileHash) {
    let q = supabase
      .from("supplier_invoices")
      .select("id, doc_number, invoice_number, status")
      .is("deleted_at", null)
      .eq("file_hash", opts.fileHash)
      .limit(1)
    if (opts.excludeId) q = q.neq("id", opts.excludeId)
    const { data } = await q
    if (data?.[0]) return toDup(data[0])
  }

  const num = normPartNumber(opts.invoiceNumber ?? "")
  if (!num) return null

  let q = supabase
    .from("supplier_invoices")
    .select("id, doc_number, invoice_number, status, supplier_id, supplier_name_raw, total")
    .is("deleted_at", null)
    .not("invoice_number", "is", null)
  if (opts.excludeId) q = q.neq("id", opts.excludeId)
  if (opts.onlyConfirmed) q = q.neq("status", "draft")
  const { data } = await q
  const supName = normName(opts.supplierName)
  const match = (data ?? []).find((r) => {
    if (normPartNumber(String(r.invoice_number ?? "")) !== num) return false
    if (opts.supplierId && r.supplier_id) return r.supplier_id === opts.supplierId
    if (supName && r.supplier_name_raw && normName(r.supplier_name_raw as string) === supName) return true
    const t = Number(opts.total ?? 0)
    return t > 0 && Math.abs(Number(r.total ?? 0) - t) < 0.01
  })
  return match ? toDup(match as never) : null
}

function duplicateMessage(d: DuplicateInvoice): string {
  return `This invoice was already uploaded as ${d.label} (${d.status}). Open the existing one instead of uploading it again.`
}

async function reportBlockedDuplicate(ctx: SessionContext, dup: DuplicateInvoice, invoiceNumber?: string | null) {
  try {
    await logAction(ctx, "supplier_invoice_duplicate_blocked", "supplier_invoice", dup.id, {
      invoice_number: invoiceNumber ?? null,
      existing: dup.label,
    })
  } catch (e) {
    console.error("reportBlockedDuplicate failed", e)
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/* ============================================================
   1. Upload + OCR -> create a DRAFT supplier invoice
   ============================================================ */
export type ExtractResult = { ok: true; id: string } | { ok: false; error: string; duplicateId?: string }

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

  const discardUpload = async () => {
    try {
      await del(blobPathname)
    } catch (e) {
      console.error("[v0] failed to clean up duplicate invoice blob:", e)
    }
  }

  // Same exact file uploaded before? Stop before spending time on OCR.
  const fileHash = await sha256Hex(bytes)
  const sameFile = await findDuplicateInvoice(supabase, { fileHash })
  if (sameFile) {
    await discardUpload()
    await reportBlockedDuplicate(ctx, sameFile, sameFile.label)
    return { ok: false, error: duplicateMessage(sameFile), duplicateId: sameFile.id }
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

  // Same invoice photographed/scanned again (different file, same document).
  const sameInvoice = await findDuplicateInvoice(supabase, {
    invoiceNumber: extracted?.invoice_number,
    supplierId,
    supplierName: extracted?.supplier_name,
    total: n(extracted?.total),
  })
  if (sameInvoice) {
    await discardUpload()
    await reportBlockedDuplicate(ctx, sameInvoice, extracted?.invoice_number)
    return { ok: false, error: duplicateMessage(sameInvoice), duplicateId: sameInvoice.id }
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
      file_hash: fileHash,
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

type QuoteRow = {
  id?: string
  kind: string
  name: string | null
  part_number: string | null
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
}

/**
 * Put a purchased part straight onto the job card's quotation at its marked-up
 * sale price. Creates the quotation when the job has none, never duplicates a
 * part already on it (same part number, or same name when no number), and
 * re-derives the quotation totals from all lines so the job card stays exact.
 */
async function addPartToJobQuotation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  part: { name: string; partNumber: string | null; quantity: number; unitPrice: number; detail: string },
  defaultVat: number,
): Promise<"added" | "updated"> {
  const { data: existing } = await supabase
    .from("quotations")
    .select(
      "id, vat_rate, vat_inclusive, quotation_items(id, kind, name, part_number, quantity, unit_price, labour_hours, labour_rate, discount, sort_order)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let quote = existing
  if (!quote) {
    const { data: created, error } = await supabase
      .from("quotations")
      .insert({ job_id: jobId, vat_rate: defaultVat, vat_inclusive: false, total: 0 })
      .select("id, vat_rate, vat_inclusive")
      .single()
    if (error) throw new Error(`Could not create the job card quotation: ${error.message}`)
    quote = { ...created, quotation_items: [] }
  }

  const vatRate = Number(quote.vat_rate ?? defaultVat)
  const inclusive = Boolean(quote.vat_inclusive)
  const items = ((quote.quotation_items as QuoteRow[] | null) ?? []).map((i) => ({ ...i }))
  const lineMath = (i: QuoteRow) => {
    const hours = Number(i.labour_hours) || 0
    const rate = Number(i.labour_rate) || 0
    const gross = i.kind === "labor" ? (hours > 0 ? hours * rate : rate) : (Number(i.quantity) || 0) * (Number(i.unit_price) || 0)
    const discount = Number(i.discount) || 0
    const base = Math.max(0, gross - discount)
    const net = inclusive ? base / (1 + vatRate / 100) : base
    const vat = inclusive ? base - net : (base * vatRate) / 100
    return { gross, discount, net, vat, lineTotal: inclusive ? base : base + vat }
  }

  const pn = part.partNumber?.trim().toLowerCase() || ""
  const nm = part.name.trim().toLowerCase()
  const match = items.find(
    (i) =>
      i.kind === "part" &&
      (pn ? (i.part_number ?? "").trim().toLowerCase() === pn : (i.name ?? "").trim().toLowerCase() === nm),
  )

  let outcome: "added" | "updated"
  if (match?.id) {
    match.unit_price = part.unitPrice
    match.part_number = match.part_number || part.partNumber
    const m = lineMath(match)
    const { error } = await supabase
      .from("quotation_items")
      .update({ unit_price: part.unitPrice, part_number: match.part_number, vat: m.vat, line_total: m.lineTotal })
      .eq("id", match.id)
    if (error) throw new Error(`Could not update "${part.name}" on the job card: ${error.message}`)
    outcome = "updated"
  } else {
    const row: QuoteRow = {
      kind: "part",
      name: part.name,
      part_number: part.partNumber,
      quantity: part.quantity,
      unit_price: part.unitPrice,
      labour_hours: 0,
      labour_rate: 0,
      discount: 0,
    }
    const m = lineMath(row)
    const { error } = await supabase.from("quotation_items").insert({
      quotation_id: quote.id,
      ...row,
      detail: part.detail,
      description: part.name,
      labor: 0,
      vat: m.vat,
      line_total: m.lineTotal,
      recommendation: "required",
      sort_order: items.length,
    })
    if (error) throw new Error(`Could not add "${part.name}" to the job card: ${error.message}`)
    items.push(row)
    outcome = "added"
  }

  const sums = items.reduce(
    (s, i) => {
      const m = lineMath(i)
      const contrib = inclusive ? m.net : m.gross
      if (i.kind === "labor") s.labor += contrib
      else s.parts += contrib
      s.discount += m.discount
      s.vat += m.vat
      return s
    },
    { parts: 0, labor: 0, discount: 0, vat: 0 },
  )
  const subtotal = inclusive ? sums.parts + sums.labor : sums.parts + sums.labor - sums.discount
  const { error: totErr } = await supabase
    .from("quotations")
    .update({
      parts_total: sums.parts,
      labor_total: sums.labor,
      discount_total: sums.discount,
      subtotal,
      vat_amount: sums.vat,
      total: subtotal + sums.vat,
    })
    .eq("id", quote.id)
  if (totErr) throw new Error(`Could not update the job card totals: ${totErr.message}`)
  return outcome
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
  match_status: "new" | "matched" | "ignore" | "expense"
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
  ctx: SessionContext,
  payload: SaveDraftPayload,
): Promise<void> {
  const clean = payload.lines.filter((l) => (l.description || "").trim())
  const subtotal = clean.reduce((t, l) => t + n(l.quantity) * n(l.unit_cost), 0)
  const vat = clean.reduce((t, l) => t + (n(l.quantity) * n(l.unit_cost) * n(l.vat_rate)) / 100, 0)
  const discount = n(payload.discountAmount)
  const total = subtotal - discount + vat

  const dup = await findDuplicateInvoice(supabase, {
    excludeId: payload.id,
    invoiceNumber: payload.invoiceNumber,
    supplierId: uuidOrNull(payload.supplierId),
    total,
  })
  if (dup) {
    await reportBlockedDuplicate(ctx, dup, payload.invoiceNumber)
    throw new Error(
      `Duplicate invoice: invoice ${payload.invoiceNumber} from this supplier already exists as ${dup.label} (${dup.status}). It was not saved.`,
    )
  }

  const { error: headErr } = await supabase
    .from("supplier_invoices")
    .update({
      // An unselected <select> sends "" — Postgres rejects "" for a uuid column
      // ("invalid input syntax for type uuid"), which silently blocked confirms.
      supplier_id: uuidOrNull(payload.supplierId),
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
          inventory_item_id: uuidOrNull(l.inventory_item_id),
          match_status: l.match_status,
          job_id: uuidOrNull(l.job_id),
          parts_request_id: uuidOrNull(l.parts_request_id),
          suggested_sale_price: n(l.suggested_sale_price),
          markup_pct: n(l.markup_pct),
        }
      }),
    )
    if (itemErr) throw new Error(itemErr.message)
  }
}

/**
 * Save edits to a draft (exported wrapper: guard + apply). Used by the
 * standalone "Save draft" button.
 *
 * Like saveAndConfirmSupplierInvoice, this intentionally does NOT call
 * revalidatePath(): that would stream an inline RSC re-render with the action
 * response, which can reject the whole POST with the opaque #441 (e.g. on
 * deploy/version skew) and hide a save that actually succeeded. The client
 * calls router.refresh() after { ok: true } to re-sync instead.
 */
export async function saveInvoiceDraft(payload: SaveDraftPayload): Promise<InvoiceActionResult> {
  try {
    const { supabase, ctx } = await guard()
    await applyDraft(supabase, ctx, payload)
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
): Promise<ConfirmSummary> {
  const { data: invoice, error: invErr } = await supabase
    .from("supplier_invoices")
    .select("id, status, supplier_id, supplier_name_raw, invoice_number, total, ocr_raw")
    .eq("id", id)
    .single()
  if (invErr) throw new Error(invErr.message)
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be confirmed")

  // Final guard: the number may have been typed/edited during review, so
  // re-check against invoices already posted to stock and the supplier ledger.
  const dup = await findDuplicateInvoice(supabase, {
    excludeId: id,
    invoiceNumber: invoice.invoice_number as string | null,
    supplierId: invoice.supplier_id as string | null,
    supplierName: invoice.supplier_name_raw as string | null,
    total: Number(invoice.total ?? 0),
    onlyConfirmed: true,
  })
  if (dup) {
    await reportBlockedDuplicate(ctx, dup, invoice.invoice_number as string | null)
    throw new Error(
      `Duplicate invoice: supplier invoice ${invoice.invoice_number} is already confirmed as ${dup.label}. Delete this draft instead of confirming it twice.`,
    )
  }

  // Auto-fill the Suppliers module: create a supplier from the scanned details
  // when none was matched, or backfill any missing contact fields on the matched
  // supplier (never overwriting values a human already entered).
  const raw = (invoice.ocr_raw ?? {}) as Record<string, unknown>
  const rawStr = (k: string) => {
    const v = raw[k]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }
  let supplierId = invoice.supplier_id as string | null
  let supplierName = ""
  let supplierCreated = false
  if (!supplierId) {
    const name = (invoice.supplier_name_raw as string | null)?.trim() || rawStr("supplier_name") || "Unknown supplier"
    // Reuse an existing supplier with the same name instead of creating a
    // duplicate every time the same vendor's invoice is scanned.
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id")
      .is("deleted_at", null)
      .ilike("name", name)
      .limit(1)
      .maybeSingle()
    if (existing?.id) supplierId = existing.id as string
  }
  if (!supplierId) {
    const name = (invoice.supplier_name_raw as string | null)?.trim() || rawStr("supplier_name") || "Unknown supplier"
    supplierName = name
    supplierCreated = true
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
  } else {
    const { data: sup } = await supabase
      .from("suppliers")
      .select("name, trn, mobile, email, address")
      .eq("id", supplierId)
      .single()
    supplierName = (sup?.name as string | undefined) ?? ""
    const backfill: Record<string, string> = {}
    if (!sup?.trn && rawStr("supplier_trn")) backfill.trn = rawStr("supplier_trn")!
    if (!sup?.mobile && rawStr("supplier_phone")) backfill.mobile = rawStr("supplier_phone")!
    if (!sup?.email && rawStr("supplier_email")) backfill.email = rawStr("supplier_email")!
    if (!sup?.address && rawStr("supplier_address")) backfill.address = rawStr("supplier_address")!
    if (Object.keys(backfill).length) await supabase.from("suppliers").update(backfill).eq("id", supplierId)
  }
  invoice.supplier_id = supplierId
  const { error: linkErr } = await supabase.from("supplier_invoices").update({ supplier_id: supplierId }).eq("id", id)
  if (linkErr) throw new Error(`Could not link the supplier: ${linkErr.message}`)

  const { data: items, error: itemsErr } = await supabase
    .from("supplier_invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no")
  if (itemsErr) throw new Error(itemsErr.message)

  const parts: ConfirmSummary["parts"] = []
  const settings = await getSettings()

  const reference = invoice.invoice_number ? `Bill ${invoice.invoice_number}` : "Supplier invoice"

  for (const it of items ?? []) {
    if (it.match_status === "ignore") continue
    const qty = n(it.quantity)
    if (qty <= 0) continue
    const cost = n(it.unit_cost)
    // Sale price always carries the markup from Financial settings unless the
    // reviewer set one explicitly on the line.
    const sale =
      n(it.suggested_sale_price) > 0
        ? n(it.suggested_sale_price)
        : suggestSalePrice(
            cost,
            settings.pricing_method,
            n(it.markup_pct) > 0 ? n(it.markup_pct) : settings.default_markup_pct,
          )

    let itemId = it.inventory_item_id as string | null
    let crmPartId: string | null = null
    let oemNumber = (it.oem_part_number as string | null)?.trim() || null
    const created = !itemId
    const jobId = (it.job_id as string | null) ?? null

    // Non-part lines (labour, towing, sublet, fees…) never touch stock. When a
    // car is chosen they post to that job's Car Expenses; otherwise they stay on
    // the invoice as a general purchase cost (already counted in payables).
    if (it.match_status === "expense") {
      const amount = Math.round(qty * cost * 100) / 100
      if (jobId && amount > 0) {
        const { error: expErr } = await supabase.from("car_expenses").insert({
          job_id: jobId,
          category: "other",
          description: it.description || "Supplier invoice expense",
          amount,
          vendor: supplierName || null,
          has_invoice: true,
          reference,
          created_by: userId,
        })
        if (expErr) throw new Error(`Could not add expense "${it.description}" to the car: ${expErr.message}`)
      }
      continue
    }

    if (itemId) {
      // Existing part: top up stock, refresh cost and (if provided) sale price.
      // Backfill OEM / supplier numbers ONLY when the part lacks them — never
      // overwrite an existing OEM number, and never touch the CRM Part ID.
      const { data: cur } = await supabase
        .from("inventory_items")
        .select("quantity, oem_part_number, supplier_part_number, crm_part_id")
        .eq("id", itemId)
        .single()
      crmPartId = (cur?.crm_part_id as string | null) ?? null
      oemNumber = (cur?.oem_part_number as string | null) || oemNumber
      const nextQty = (n(cur?.quantity) || 0) + qty
      const { error: updItemErr } = await supabase
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
      if (updItemErr) throw new Error(`Could not update part "${it.description}": ${updItemErr.message}`)
    } else {
      // New part: create the inventory record with opening quantity. The CRM
      // Part ID is assigned automatically by a DB trigger (SHW-P-######).
      const { data: newItem, error: createErr } = await supabase
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
        .select("id, crm_part_id, sku")
        .single()
      if (createErr) throw new Error(`Could not create part "${it.description}": ${createErr.message}`)
      itemId = newItem.id as string
      crmPartId = (newItem.crm_part_id as string | null) ?? null
      // No OEM / supplier number on the bill: the auto-generated CRM Part ID
      // becomes the part number so every part is still searchable.
      if (!newItem.sku && crmPartId) {
        await supabase.from("inventory_items").update({ sku: crmPartId }).eq("id", itemId)
      }
    }

    const { error: lineErr } = await supabase
      .from("supplier_invoice_items")
      .update({ inventory_item_id: itemId, match_status: "matched" })
      .eq("id", it.id)
    if (lineErr) throw new Error(lineErr.message)

    const { error: mvErr } = await supabase.from("stock_movements").insert({
      item_id: itemId,
      kind: "in",
      quantity: qty,
      unit_cost: cost,
      reference,
      job_id: jobId,
      supplier_id: invoice.supplier_id,
      created_by: userId,
    })
    if (mvErr) throw new Error(`Could not record stock for "${it.description}": ${mvErr.message}`)

    // Link the part to the chosen job card / car so it shows on that job's
    // parts list with its real cost. Reuse the originating parts request when
    // there is one, otherwise record a new "received" request on the job.
    if (jobId) {
      if (it.parts_request_id) {
        const { error: prErr } = await supabase
          .from("parts_requests")
          .update({ status: "received", cost, supplier: supplierName || null, updated_at: new Date().toISOString() })
          .eq("id", it.parts_request_id)
        if (prErr) throw new Error(prErr.message)
      } else {
        const { data: pr, error: prErr } = await supabase
          .from("parts_requests")
          .insert({
            job_id: jobId,
            part_name: it.description || "Part",
            quantity: qty,
            status: "received",
            supplier: supplierName || null,
            cost,
            notes: reference,
          })
          .select("id")
          .single()
        if (prErr) throw new Error(`Could not link "${it.description}" to the job card: ${prErr.message}`)
        await supabase.from("supplier_invoice_items").update({ parts_request_id: pr.id }).eq("id", it.id)
      }

      await addPartToJobQuotation(
        supabase,
        jobId,
        {
          name: it.description || "Part",
          partNumber: oemNumber ?? crmPartId,
          quantity: qty,
          unitPrice: sale,
          detail: crmPartId && oemNumber ? `${crmPartId} · ${reference}` : reference,
        },
        n(settings.vat_rate, 5),
      )
    }

    parts.push({
      inventoryItemId: itemId,
      name: it.description || "Part",
      quantity: qty,
      created,
      jobId,
      crmPartId,
      oemNumber,
      salePrice: sale,
    })
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
  return { supplierId: supplierId as string, supplierName, supplierCreated, parts }
}

/** Confirm an already-saved draft (standalone confirm button). */
export async function confirmSupplierInvoice(id: string): Promise<ConfirmResult> {
  try {
    const { supabase, ctx, userId } = await guard()
    const summary = await applyConfirm(supabase, ctx, userId, id)
    return { ok: true, summary }
  } catch (e) {
    return toActionError(e, "Could not confirm the invoice.")
  }
}

/**
 * Save the user's latest edits AND confirm in ONE server action.
 *
 * IMPORTANT: this action deliberately does NOT call revalidatePath(). Calling
 * revalidatePath() inside a Server Action makes Next.js stream an inline RSC
 * re-render of the current route back as part of the action response. If that
 * streamed re-render throws for ANY reason — a transient render error, or (most
 * commonly in production) deployment/version skew between the browser's cached
 * client bundle and a freshly deployed server — Next.js rejects the whole POST
 * with the opaque "Server Components render" error (minified React #441) and
 * DISCARDS this action's already-committed { ok: true } result. The write
 * succeeded on the server, but the user sees only #441 and the invoice looks
 * stuck as a draft.
 *
 * Because every invoice route renders dynamically (it reads the session via
 * cookies(), so there is no full-route cache to invalidate), revalidatePath()
 * buys us nothing here except that fragile inline re-render. Instead the client
 * calls router.refresh() after it receives { ok: true } — a fresh, independent
 * server round-trip that re-syncs the UI to the confirmed state and cannot take
 * the action's result down with it if it fails.
 */
export async function saveAndConfirmSupplierInvoice(payload: SaveDraftPayload): Promise<ConfirmResult> {
  try {
    const { supabase, ctx, userId } = await guard()
    await applyDraft(supabase, ctx, payload)
    const summary = await applyConfirm(supabase, ctx, userId, payload.id)
    return { ok: true, summary }
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

  const method = s(formData.get("method")) || "cash"
  const receiptPath = s(formData.get("receipt_path"))
  if (receiptPath && !receiptPath.startsWith("payment-receipts/")) throw new Error("Invalid receipt file")
  if (["card", "bank", "bank_transfer"].includes(method) && !receiptPath) {
    throw new Error(
      method === "card"
        ? "Upload the card payment receipt as proof."
        : "Upload the bank transfer receipt as proof.",
    )
  }

  const { data: invoice } = await supabase.from("supplier_invoices").select("total, status").eq("id", id).single()
  if (!invoice || invoice.status !== "confirmed") throw new Error("Invoice is not confirmed")

  const { data: existingPayments } = await supabase.from("payments").select("amount").eq("supplier_invoice_id", id)
  const alreadyPaid = (existingPayments ?? []).reduce((t, p) => t + n(p.amount), 0)
  const remaining = Math.max(0, n(invoice.total) - alreadyPaid)
  if (remaining <= 0.01) throw new Error("This invoice is already fully paid.")
  if (amount > remaining + 0.01) {
    throw new Error(`Amount is more than the outstanding balance (AED ${remaining.toFixed(2)}).`)
  }

  const { error: insertError } = await supabase.from("payments").insert({
    direction: "out",
    supplier_invoice_id: id,
    amount,
    method,
    receipt_path: receiptPath,
    reference: s(formData.get("reference")),
    paid_at: s(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
    note: s(formData.get("note")),
    created_by: userId,
  })
  if (insertError) throw new Error(insertError.message)

  const { data: paidRows } = await supabase.from("payments").select("amount").eq("supplier_invoice_id", id)
  const paid = (paidRows ?? []).reduce((t, p) => t + n(p.amount), 0)
  const total = n(invoice.total)
  const status = paid <= 0 ? "unpaid" : paid + 0.01 >= total ? "paid" : "partial"

  await supabase
    .from("supplier_invoices")
    .update({ amount_paid: paid, payment_status: status, updated_at: new Date().toISOString() })
    .eq("id", id)
  await notifyActivity({
    title: "Supplier invoice payment",
    body: `AED ${amount} (${status})`,
    link: `/purchasing/invoices/${id}`,
  })

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
  await logCurrent("supplier_invoice.on_account", "supplier_invoice", id, { on_account: onAccount })
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

/* ============================================================
   7. Delete a confirmed duplicate (reverses stock + job links)
   ============================================================ */
/**
 * A confirmed invoice has already added stock, written stock movements and
 * linked parts to job cards, so removing a duplicate must undo those postings
 * or stock and job costs stay counted twice. Restricted to purchasing managers
 * because the reversal touches inventory; runs on the service client since
 * inventory/stock RLS requires parts.manage. Soft-deletes the invoice row so
 * the audit trail survives.
 */
export type DeleteDuplicateResult =
  | { ok: true }
  | { ok: false; error: string; paymentTotal?: number; paymentCount?: number }

export async function deleteDuplicateInvoice(
  id: string,
  opts: { removePayments?: boolean } = {},
): Promise<DeleteDuplicateResult> {
  try {
    const ctx = await requireAnyPermission(["purchase_orders.manage"])
    const db = createServiceClient()

    const { data: inv, error: invErr } = await db
      .from("supplier_invoices")
      .select("id, status, doc_number, invoice_number, supplier_id, supplier_name_raw, amount_paid, deleted_at")
      .eq("id", id)
      .maybeSingle()
    if (invErr) throw new Error(invErr.message)
    if (!inv || inv.deleted_at) return { ok: true }
    if (inv.status !== "confirmed") throw new Error("Use Delete draft for invoices that are not confirmed yet.")
    if (!inv.invoice_number) throw new Error("This invoice has no invoice number, so it cannot be a duplicate.")

    const { data: sameNumber } = await db
      .from("supplier_invoices")
      .select("id, doc_number, invoice_number, supplier_id, supplier_name_raw, deleted_at")
      .is("deleted_at", null)
      .ilike("invoice_number", String(inv.invoice_number).trim())
    const twins = findDuplicateGroups([inv, ...(sameNumber ?? []).filter((r) => r.id !== id)]).get(id) ?? []
    if (!twins.length) throw new Error("This invoice is no longer a duplicate — the other copy was already removed.")

    const { data: copyPayments, error: payErr } = await db
      .from("payments")
      .select("id, amount")
      .eq("supplier_invoice_id", id)
    if (payErr) throw new Error(payErr.message)
    const paymentCount = copyPayments?.length ?? 0
    const paymentTotal = (copyPayments ?? []).reduce((s, p) => s + n(p.amount), 0)
    if ((paymentCount > 0 || n(inv.amount_paid) > 0) && !opts.removePayments) {
      return {
        ok: false,
        error: "This copy has a payment recorded on it.",
        paymentCount,
        paymentTotal: paymentTotal || n(inv.amount_paid),
      }
    }

    const { data: items, error: itemsErr } = await db
      .from("supplier_invoice_items")
      .select("id, description, quantity, unit_cost, inventory_item_id, match_status, parts_request_id")
      .eq("invoice_id", id)
    if (itemsErr) throw new Error(itemsErr.message)

    const reference = `Reversal of duplicate ${inv.doc_number ?? `bill ${inv.invoice_number}`}`
    const billRef = `Bill ${inv.invoice_number}`

    for (const it of items ?? []) {
      if (it.match_status === "ignore" || !it.inventory_item_id) continue
      const qty = n(it.quantity)
      if (qty <= 0) continue

      const { data: cur } = await db.from("inventory_items").select("quantity").eq("id", it.inventory_item_id).single()
      const onHand = Math.max(0, n(cur?.quantity))
      const removed = Math.min(qty, onHand)
      if (removed > 0) {
        const { error: qErr } = await db
          .from("inventory_items")
          .update({ quantity: onHand - removed, updated_at: new Date().toISOString() })
          .eq("id", it.inventory_item_id)
        if (qErr) throw new Error(`Could not reverse stock for "${it.description}": ${qErr.message}`)
        const { error: mvErr } = await db.from("stock_movements").insert({
          item_id: it.inventory_item_id,
          kind: "out",
          quantity: removed,
          unit_cost: n(it.unit_cost),
          reference,
          supplier_id: inv.supplier_id,
          created_by: ctx.userId,
        })
        if (mvErr) throw new Error(`Could not record the stock reversal for "${it.description}": ${mvErr.message}`)
      }

      // Remove the job-card part line this copy created, but only when no other
      // live invoice also points at it (the original copy keeps it).
      if (it.parts_request_id) {
        const { data: others } = await db
          .from("supplier_invoice_items")
          .select("id, supplier_invoices!inner(deleted_at)")
          .eq("parts_request_id", it.parts_request_id)
          .neq("invoice_id", id)
          .is("supplier_invoices.deleted_at", null)
          .limit(1)
        if (!others?.length) {
          await db.from("parts_requests").delete().eq("id", it.parts_request_id).eq("notes", billRef)
        }
      }
    }

    const { error: delErr } = await db
      .from("supplier_invoices")
      .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
      .eq("id", id)
    if (delErr) throw new Error(delErr.message)

    // The duplicate copy's payment is a duplicate record too; remove it so the
    // supplier ledger and cash reports don't count the same bill paid twice.
    if (paymentCount > 0) {
      const { error: pdErr } = await db.from("payments").delete().eq("supplier_invoice_id", id)
      if (pdErr) throw new Error(`Invoice removed, but its payment could not be deleted: ${pdErr.message}`)
    }

    await logAction(ctx, "supplier_invoice_duplicate_deleted", "supplier_invoice", id, {
      payments_removed: paymentCount,
      payment_total: paymentTotal,
    })
    revalidatePath("/purchasing/payments")
    revalidatePath("/purchasing/invoices")
    revalidatePath("/inventory")
    return { ok: true }
  } catch (e) {
    return toActionError(e, "Could not delete the duplicate invoice.")
  }
}
