import type { SupabaseClient } from "@supabase/supabase-js"
import { partMatchScore, PART_MATCH_THRESHOLD } from "@/lib/part-match"

const OPEN_STATUSES = ["required", "ordered", "backordered"]
const SKIP_LINES = new Set(["ignore", "expense"])

type OpenRequest = { id: string; job_id: string | null; part_name: string | null }
type InvoiceLine = { id: string; description: string | null; job_id: string | null }

export type ReceiveResult = { received: number; ambiguous: number }

/**
 * When a supplier invoice is confirmed, close the parts that were ordered from
 * that same supplier's quote, so they move from "Ordered" to "Received" even
 * when the purchaser did not pick a job for the invoice line.
 * A line only closes a request when exactly one job has a clear best match;
 * lines that could belong to several cars are left for a person to assign.
 */
export async function receiveQuotedPartsForInvoice(db: SupabaseClient, invoiceId: string): Promise<ReceiveResult> {
  const none = { received: 0, ambiguous: 0 }
  const { data: invoice } = await db
    .from("supplier_invoices")
    .select("id, supplier_id, doc_type, status, deleted_at")
    .eq("id", invoiceId)
    .maybeSingle()
  if (!invoice || invoice.deleted_at || invoice.doc_type === "quote" || invoice.status !== "confirmed") return none
  if (!invoice.supplier_id) return none

  const { data: lineRows } = await db
    .from("supplier_invoice_items")
    .select("id, description, job_id, match_status")
    .eq("invoice_id", invoiceId)
    .is("parts_request_id", null)
  const lines = ((lineRows ?? []) as (InvoiceLine & { match_status: string | null })[]).filter(
    (l) => !SKIP_LINES.has(String(l.match_status ?? "")),
  )
  if (!lines.length) return none

  const { data: quoteLinks } = await db
    .from("supplier_invoice_items")
    .select("parts_request_id, supplier_invoices!inner(supplier_id, doc_type, deleted_at)")
    .not("parts_request_id", "is", null)
    .eq("supplier_invoices.supplier_id", invoice.supplier_id)
    .eq("supplier_invoices.doc_type", "quote")
    .is("supplier_invoices.deleted_at", null)
  const requestIds = [...new Set(((quoteLinks ?? []) as { parts_request_id: string }[]).map((r) => r.parts_request_id))]
  if (!requestIds.length) return none

  const open: OpenRequest[] = []
  for (let i = 0; i < requestIds.length; i += 200) {
    const { data } = await db
      .from("parts_requests")
      .select("id, job_id, part_name")
      .in("id", requestIds.slice(i, i + 200))
      .in("status", OPEN_STATUSES)
      .is("deleted_at", null)
    open.push(...((data ?? []) as OpenRequest[]))
  }
  if (!open.length) return none

  const used = new Set<string>()
  let received = 0
  let ambiguous = 0
  for (const line of lines) {
    const pool = open.filter((r) => !used.has(r.id) && (!line.job_id || r.job_id === line.job_id))
    const scored = pool
      .map((r) => ({ r, s: partMatchScore(line.description, r.part_name) }))
      .filter((x) => x.s >= PART_MATCH_THRESHOLD)
      .sort((a, b) => b.s - a.s)
    if (!scored.length) continue
    const top = scored[0]
    const rival = scored.find((x) => x.r.job_id !== top.r.job_id && top.s - x.s < 0.05)
    if (rival) {
      ambiguous++
      continue
    }
    const { error } = await db
      .from("parts_requests")
      .update({ status: "received", updated_at: new Date().toISOString() })
      .eq("id", top.r.id)
    if (error) continue
    await db.from("supplier_invoice_items").update({ parts_request_id: top.r.id }).eq("id", line.id)
    used.add(top.r.id)
    received++
  }
  return { received, ambiguous }
}
