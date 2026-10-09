import "server-only"
import type { createServiceClient } from "@/lib/supabase/server"

type Db = ReturnType<typeof createServiceClient>

export const normKey = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

const num = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export type ApprovedPart = { name: string; partNumber: string | null; quantity: number }

export type JobApproval = {
  approvalId: string
  status: "approved" | "partial"
  decidedAt: string | null
  approved: ApprovedPart[]
  declined: ApprovedPart[]
}

type SnapItem = { key?: string; kind?: string; name?: string | null; part_number?: string | null; quantity?: number }

/**
 * The customer's latest decision per job. Only jobs whose most recent approval
 * is approved / partly approved are returned; a pending or superseded request
 * means the customer has not decided yet, so nothing should be ordered.
 */
export async function getJobApprovals(db: Db, jobIds: string[]): Promise<Map<string, JobApproval>> {
  const out = new Map<string, JobApproval>()
  if (!jobIds.length) return out
  const { data: requests } = await db
    .from("approval_requests")
    .select("id, job_id, status, decided_at, snapshot, created_at")
    .in("job_id", jobIds)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })

  const latest = new Map<string, NonNullable<typeof requests>[number]>()
  for (const r of requests ?? []) if (!latest.has(r.job_id as string)) latest.set(r.job_id as string, r)
  const decided = [...latest.values()].filter((r) => r.status === "approved" || r.status === "partial")
  if (!decided.length) return out

  const { data: decisions } = await db
    .from("approval_item_decisions")
    .select("approval_request_id, item_key, decision")
    .in(
      "approval_request_id",
      decided.map((r) => r.id as string),
    )
  const decisionOf = new Map<string, string>()
  for (const d of decisions ?? []) decisionOf.set(`${d.approval_request_id}:${d.item_key}`, d.decision as string)

  for (const r of decided) {
    const items = (((r.snapshot ?? {}) as { items?: SnapItem[] }).items ?? []).filter((i) => i.kind === "part")
    const approved: ApprovedPart[] = []
    const declined: ApprovedPart[] = []
    for (const i of items) {
      const part = { name: (i.name ?? "Part").trim(), partNumber: i.part_number ?? null, quantity: num(i.quantity) || 1 }
      if (decisionOf.get(`${r.id}:${i.key}`) === "rejected") declined.push(part)
      else approved.push(part)
    }
    out.set(r.job_id as string, {
      approvalId: r.id as string,
      status: r.status as "approved" | "partial",
      decidedAt: (r.decided_at as string | null) ?? null,
      approved,
      declined,
    })
  }
  return out
}

type LineLike = { description: string | null; oem_part_number?: string | null; supplier_part_number?: string | null }

/** Same part when the part numbers match, or the names do. */
export function samePart(a: { name: string; partNumber: string | null }, line: LineLike): boolean {
  const pn = normKey(a.partNumber)
  if (pn && (pn === normKey(line.oem_part_number) || pn === normKey(line.supplier_part_number))) return true
  const an = normKey(a.name)
  const ln = normKey(line.description)
  return !!an && !!ln && (an === ln || (an.length >= 6 && ln.length >= 6 && (an.includes(ln) || ln.includes(an))))
}

/** Same line between two supplier documents (quote ↔ invoice). */
export function sameLine(a: LineLike, b: LineLike): boolean {
  const ao = normKey(a.oem_part_number)
  const bo = normKey(b.oem_part_number)
  if (ao && bo) return ao === bo
  return samePart({ name: a.description ?? "", partNumber: a.oem_part_number ?? a.supplier_part_number ?? null }, b)
}

/* ------------------------------------------------------------------ */

export type ComparisonRow = {
  name: string
  partNumber: string | null
  quotedQty: number | null
  quotedCost: number | null
  invoicedQty: number | null
  invoicedCost: number | null
  status: "same" | "price_up" | "price_down" | "qty" | "missing" | "extra" | "declined"
}

export type QuoteComparison = {
  quote: { id: string; label: string; date: string | null }
  rows: ComparisonRow[]
  quotedTotal: number
  invoicedTotal: number
}

type ItemRow = {
  description: string | null
  oem_part_number: string | null
  supplier_part_number: string | null
  quantity: number | null
  unit_cost: number | null
  job_id: string | null
  match_status: string | null
}

/**
 * Line-by-line difference between a supplier quote and the invoice that
 * replaced it: price changes, quantity changes, parts not delivered, extra
 * parts, and any line the customer declined but was still billed.
 */
export async function buildQuoteComparison(db: Db, invoiceId: string, quoteId: string): Promise<QuoteComparison | null> {
  const [{ data: quote }, { data: qItems }, { data: iItems }] = await Promise.all([
    db.from("supplier_invoices").select("id, doc_number, invoice_number, invoice_date, created_at").eq("id", quoteId).maybeSingle(),
    db
      .from("supplier_invoice_items")
      .select("description, oem_part_number, supplier_part_number, quantity, unit_cost, job_id, match_status")
      .eq("invoice_id", quoteId)
      .order("line_no"),
    db
      .from("supplier_invoice_items")
      .select("description, oem_part_number, supplier_part_number, quantity, unit_cost, job_id, match_status")
      .eq("invoice_id", invoiceId)
      .order("line_no"),
  ])
  if (!quote) return null

  const live = (rows: ItemRow[] | null) => (rows ?? []).filter((r) => r.match_status !== "ignore")
  const quoted = live(qItems as ItemRow[] | null)
  const invoiced = live(iItems as ItemRow[] | null)

  const jobIds = [...new Set([...quoted, ...invoiced].map((r) => r.job_id).filter(Boolean) as string[])]
  const approvals = await getJobApprovals(db, jobIds)
  const isDeclined = (line: ItemRow) => {
    const a = line.job_id ? approvals.get(line.job_id) : undefined
    return !!a && a.declined.some((d) => samePart(d, line)) && !a.approved.some((p) => samePart(p, line))
  }

  const usedInvoice = new Set<number>()
  const rows: ComparisonRow[] = []
  for (const q of quoted) {
    const idx = invoiced.findIndex((inv, i) => !usedInvoice.has(i) && sameLine(q, inv))
    const inv = idx >= 0 ? invoiced[idx] : null
    if (idx >= 0) usedInvoice.add(idx)
    const qQty = num(q.quantity)
    const qCost = num(q.unit_cost)
    let status: ComparisonRow["status"] = "missing"
    if (inv) {
      const iQty = num(inv.quantity)
      const iCost = num(inv.unit_cost)
      if (isDeclined(inv)) status = "declined"
      else if (Math.abs(iCost - qCost) >= 0.01) status = iCost > qCost ? "price_up" : "price_down"
      else if (Math.abs(iQty - qQty) >= 0.001) status = "qty"
      else status = "same"
    }
    rows.push({
      name: q.description || "Part",
      partNumber: q.oem_part_number || q.supplier_part_number || null,
      quotedQty: qQty,
      quotedCost: qCost,
      invoicedQty: inv ? num(inv.quantity) : null,
      invoicedCost: inv ? num(inv.unit_cost) : null,
      status,
    })
  }
  invoiced.forEach((inv, i) => {
    if (usedInvoice.has(i)) return
    rows.push({
      name: inv.description || "Part",
      partNumber: inv.oem_part_number || inv.supplier_part_number || null,
      quotedQty: null,
      quotedCost: null,
      invoicedQty: num(inv.quantity),
      invoicedCost: num(inv.unit_cost),
      status: isDeclined(inv) ? "declined" : "extra",
    })
  })

  const sum = (list: ItemRow[]) => list.reduce((t, r) => t + num(r.quantity) * num(r.unit_cost), 0)
  return {
    quote: {
      id: quote.id as string,
      label: (quote.doc_number as string | null) || (quote.invoice_number as string | null) || "Supplier quote",
      date: (quote.invoice_date as string | null) ?? (quote.created_at as string | null) ?? null,
    },
    rows,
    quotedTotal: sum(quoted),
    invoicedTotal: sum(invoiced),
  }
}

/* ------------------------------------------------------------------ */

/**
 * After a supplier invoice is scanned, find the open supplier quote it fulfils
 * (same supplier, overlapping parts, not invoiced yet). Links the two and
 * copies the car / parts request from each quoted line onto the matching
 * invoice line, so the purchaser does not have to pick the car again.
 */
export async function linkInvoiceToOpenQuote(
  db: Db,
  invoiceId: string,
  supplierId: string | null,
  supplierName: string | null,
): Promise<string | null> {
  const supKey = normKey(supplierName)
  if (!supplierId && !supKey) return null

  const { data: quotes } = await db
    .from("supplier_invoices")
    .select("id, supplier_id, supplier_name_raw")
    .eq("doc_type", "quote")
    .eq("status", "quoted")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
  const candidates = (quotes ?? []).filter(
    (q) =>
      (supplierId && q.supplier_id === supplierId) ||
      (supKey && normKey(q.supplier_name_raw as string | null) === supKey),
  )
  if (!candidates.length) return null

  const { data: taken } = await db
    .from("supplier_invoices")
    .select("source_quote_id")
    .in(
      "source_quote_id",
      candidates.map((q) => q.id as string),
    )
    .is("deleted_at", null)
  const takenIds = new Set((taken ?? []).map((t) => t.source_quote_id as string))
  const open = candidates.filter((q) => !takenIds.has(q.id as string))
  if (!open.length) return null

  const { data: invItems } = await db
    .from("supplier_invoice_items")
    .select("id, description, oem_part_number, supplier_part_number, job_id")
    .eq("invoice_id", invoiceId)
  if (!invItems?.length) return null

  const { data: quoteItems } = await db
    .from("supplier_invoice_items")
    .select("invoice_id, description, oem_part_number, supplier_part_number, job_id, parts_request_id")
    .in(
      "invoice_id",
      open.map((q) => q.id as string),
    )

  let best: { id: string; score: number } | null = null
  for (const q of open) {
    const lines = (quoteItems ?? []).filter((l) => l.invoice_id === q.id)
    const score = invItems.filter((inv) => lines.some((l) => sameLine(l, inv))).length
    if (score > 0 && (!best || score > best.score)) best = { id: q.id as string, score }
  }
  if (!best) return null

  await db.from("supplier_invoices").update({ source_quote_id: best.id }).eq("id", invoiceId)
  const lines = (quoteItems ?? []).filter((l) => l.invoice_id === best!.id)
  for (const inv of invItems) {
    if (inv.job_id) continue
    const q = lines.find((l) => sameLine(l, inv))
    if (q?.job_id) {
      await db
        .from("supplier_invoice_items")
        .update({ job_id: q.job_id, parts_request_id: q.parts_request_id ?? null })
        .eq("id", inv.id)
    }
  }
  return best.id
}
