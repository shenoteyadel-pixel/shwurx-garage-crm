import "server-only"
import type { createServiceClient } from "@/lib/supabase/server"
import { partMatchScore, PART_MATCH_THRESHOLD } from "@/lib/part-match"

type Db = ReturnType<typeof createServiceClient>

export type PartSource = "bill" | "quote" | "request"
export type PartBucket = "waiting" | "bought_on_quote" | "bought_extra"

type Row = {
  id: string
  part_name: string | null
  quantity: number | string | null
  status: string
  supplier: string | null
  cost: number | string | null
  notes: string | null
  created_at: string
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
const BILL_NOTE = /^bill\b|supplier invoice|manual purchase/i
const QUOTE_NOTE = /\bquote\b/i

async function loadLinks(db: Db, ids: string[]) {
  const bill = new Set<string>()
  const quote = new Set<string>()
  if (!ids.length) return { bill, quote }
  const { data } = await db
    .from("supplier_invoice_items")
    .select("parts_request_id, supplier_invoices(doc_type, deleted_at)")
    .in("parts_request_id", ids)
  for (const r of (data ?? []) as any[]) {
    const inv = Array.isArray(r.supplier_invoices) ? r.supplier_invoices[0] : r.supplier_invoices
    if (!inv || inv.deleted_at) continue
    if (inv.doc_type === "quote") quote.add(r.parts_request_id)
    else bill.add(r.parts_request_id)
  }
  return { bill, quote }
}

/** Where a part row came from: a supplier bill, a supplier quote, or a staff / quotation request. */
export async function classifyPartRows(db: Db, rows: Pick<Row, "id" | "notes">[]): Promise<Map<string, PartSource>> {
  const links = await loadLinks(db, rows.map((r) => r.id))
  const out = new Map<string, PartSource>()
  for (const r of rows) {
    const notes = String(r.notes ?? "")
    if (links.bill.has(r.id) || BILL_NOTE.test(notes)) out.set(r.id, "bill")
    else if (links.quote.has(r.id) || QUOTE_NOTE.test(notes)) out.set(r.id, "quote")
    else out.set(r.id, "request")
  }
  return out
}

function bestMatch(target: Row, pool: Row[], used: Set<string>): Row | null {
  let best: Row | null = null
  let bestScore = 0
  for (const c of pool) {
    if (used.has(c.id)) continue
    const s = norm(c.part_name) === norm(target.part_name) ? 1 : partMatchScore(target.part_name, c.part_name)
    if (s >= PART_MATCH_THRESHOLD && s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

export type PartsRequestCleanup = { removed: number; duplicates: number; fulfilled: number }

/**
 * Keeps one row per real part on a job's parts list:
 * 1. the same bill line posted more than once is kept once,
 * 2. a request or supplier-quote row that a bill already bought is folded into the bill,
 * 3. a staff request that a supplier quote already covers is folded into the quote.
 * Rows are soft-deleted, so they can be restored from the Recycle Bin.
 */
export async function reconcilePartsRequests(db: Db, jobId: string): Promise<PartsRequestCleanup> {
  const { data } = await db
    .from("parts_requests")
    .select("id, part_name, quantity, status, supplier, cost, notes, created_at")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at")
  const rows = (data ?? []) as Row[]
  if (rows.length < 2) return { removed: 0, duplicates: 0, fulfilled: 0 }

  const links = await loadLinks(db, rows.map((r) => r.id))
  const source = await classifyPartRows(db, rows)
  const toDelete = new Set<string>()

  const bills = rows.filter((r) => source.get(r.id) === "bill")
  const groups = new Map<string, Row[]>()
  for (const b of bills) {
    const key = [norm(b.part_name), n(b.quantity), n(b.cost), norm(b.notes)].join("|")
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  let duplicates = 0
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const linked = g.filter((r) => links.bill.has(r.id))
    const keep = Math.max(1, linked.length)
    const ordered = [...linked, ...g.filter((r) => !links.bill.has(r.id))]
    for (const r of ordered.slice(keep)) {
      toDelete.add(r.id)
      duplicates++
    }
  }

  const liveBills = bills.filter((b) => !toDelete.has(b.id))
  const quotes = rows.filter((r) => source.get(r.id) === "quote")
  const requests = rows.filter((r) => source.get(r.id) === "request")
  let fulfilled = 0

  const fold = (sources: Row[], targets: Row[]) => {
    const used = new Set<string>()
    for (const s of sources) {
      if (toDelete.has(s.id)) continue
      const t = bestMatch(s, targets, used)
      if (!t) continue
      used.add(t.id)
      toDelete.add(s.id)
      fulfilled++
    }
  }
  fold(quotes, liveBills)
  fold(requests, liveBills)
  fold(
    requests.filter((r) => r.status !== "received"),
    quotes.filter((q) => !toDelete.has(q.id)),
  )

  if (toDelete.size) {
    await db
      .from("parts_requests")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", [...toDelete])
  }
  return { removed: toDelete.size, duplicates, fulfilled }
}

/** Split a job's parts into still waiting / bought for the customer quote / bought extra. */
export function bucketParts<T extends { id: string; part_name: string | null; status: string }>(
  parts: T[],
  source: Map<string, PartSource>,
  quotedNames: string[],
): Map<string, PartBucket> {
  const out = new Map<string, PartBucket>()
  for (const p of parts) {
    const bought = source.get(p.id) === "bill" || p.status === "received"
    if (!bought) {
      out.set(p.id, "waiting")
      continue
    }
    const onQuote = quotedNames.some(
      (q) => norm(q) === norm(p.part_name) || partMatchScore(p.part_name, q) >= PART_MATCH_THRESHOLD,
    )
    out.set(p.id, onQuote ? "bought_on_quote" : "bought_extra")
  }
  return out
}
