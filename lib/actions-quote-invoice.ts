"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { requireAnyPermission, logAction, ForbiddenError } from "@/lib/rbac/context"
import { getJobApprovals, samePart } from "@/lib/quote-invoice"

export type FromQuoteResult =
  | { ok: true; id: string; copied: number; skipped: string[]; existing: boolean }
  | { ok: false; error: string }

/**
 * Turn a supplier quote into a draft supplier invoice with only the lines the
 * customer approved. The purchaser then just types the supplier's invoice
 * number and adjusts any price that changed — the comparison panel shows
 * every difference before it is confirmed.
 */
export async function createInvoiceFromQuote(quoteId: string): Promise<FromQuoteResult> {
  try {
    const ctx = await requireAnyPermission(["purchase_orders.manage", "parts.view"])
    const supabase = await createClient()
    const db = createServiceClient()

    const { data: quote } = await supabase
      .from("supplier_invoices")
      .select("id, doc_type, status, doc_number, supplier_id, supplier_name_raw, currency, deleted_at")
      .eq("id", quoteId)
      .maybeSingle()
    if (!quote || quote.deleted_at) return { ok: false, error: "Supplier quote not found." }
    if (quote.doc_type !== "quote" || quote.status !== "quoted") {
      return { ok: false, error: "Only a sent supplier quote can be turned into an invoice." }
    }

    const { data: already } = await supabase
      .from("supplier_invoices")
      .select("id")
      .eq("source_quote_id", quoteId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
    if (already?.id) return { ok: true, id: already.id as string, copied: 0, skipped: [], existing: true }

    const { data: items } = await supabase
      .from("supplier_invoice_items")
      .select("*")
      .eq("invoice_id", quoteId)
      .order("line_no")
    const lines = (items ?? []).filter((l) => l.match_status !== "ignore")

    const jobIds = [...new Set(lines.map((l) => l.job_id).filter(Boolean) as string[])]
    const approvals = await getJobApprovals(db, jobIds)

    const skipped: string[] = []
    const keep = lines.filter((l) => {
      const a = l.job_id ? approvals.get(l.job_id as string) : undefined
      if (!a) return true
      const line = l as { description: string | null; oem_part_number: string | null; supplier_part_number: string | null }
      const approved = a.approved.some((p) => samePart(p, line))
      const declined = a.declined.some((p) => samePart(p, line))
      if (declined && !approved) {
        skipped.push(String(l.description || "Part"))
        return false
      }
      return true
    })
    if (!keep.length) return { ok: false, error: "The customer declined every part on this quote. Nothing to invoice." }

    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
    const subtotal = keep.reduce((t, l) => t + n(l.quantity) * n(l.unit_cost), 0)
    const vat = keep.reduce((t, l) => t + (n(l.quantity) * n(l.unit_cost) * n(l.vat_rate)) / 100, 0)

    const { data: inv, error } = await supabase
      .from("supplier_invoices")
      .insert({
        supplier_id: quote.supplier_id,
        supplier_name_raw: quote.supplier_name_raw,
        currency: quote.currency || "AED",
        doc_type: "invoice",
        status: "draft",
        source_quote_id: quoteId,
        subtotal,
        vat_amount: vat,
        total: subtotal + vat,
        notes: `From supplier quote ${quote.doc_number ?? ""}`.trim(),
        created_by: ctx.userId,
      })
      .select("id")
      .single()
    if (error) return { ok: false, error: error.message }

    const { error: itemErr } = await supabase.from("supplier_invoice_items").insert(
      keep.map((l, i) => ({
        invoice_id: inv.id,
        line_no: i + 1,
        description: l.description,
        sku: l.sku,
        oem_part_number: l.oem_part_number,
        supplier_part_number: l.supplier_part_number,
        quantity: n(l.quantity) || 1,
        unit: l.unit || "pcs",
        unit_cost: n(l.unit_cost),
        line_total: n(l.quantity) * n(l.unit_cost),
        vat_rate: n(l.vat_rate),
        inventory_item_id: l.inventory_item_id,
        match_status: l.inventory_item_id ? "matched" : l.match_status === "expense" ? "expense" : "new",
        job_id: l.job_id,
        parts_request_id: l.parts_request_id,
        suggested_sale_price: n(l.suggested_sale_price),
        markup_pct: n(l.markup_pct),
      })),
    )
    if (itemErr) {
      await supabase.from("supplier_invoices").delete().eq("id", inv.id)
      return { ok: false, error: itemErr.message }
    }

    await logAction(ctx, "supplier_invoice_from_quote", "supplier_invoice", inv.id as string, {
      quote_id: quoteId,
      skipped,
    })
    revalidatePath("/purchasing/invoices")
    revalidatePath("/purchasing/approved")
    return { ok: true, id: inv.id as string, copied: keep.length, skipped, existing: false }
  } catch (e) {
    const msg =
      e instanceof ForbiddenError
        ? "You do not have permission to do this."
        : e instanceof Error && e.message
          ? e.message
          : "Could not create the invoice from this quote."
    return { ok: false, error: msg }
  }
}
