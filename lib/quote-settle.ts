import "server-only"
import type { createServiceClient } from "@/lib/supabase/server"

type Db = ReturnType<typeof createServiceClient>

const FINISHED_STAGES = ["ready_for_delivery", "delivered"]
const CHUNK = 100

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

/**
 * A supplier quote is only a price — no money is owed on it. Once its car has
 * a real supplier invoice, is finished, or the customer has paid, the quote is
 * done, so it is closed as "invoiced" and drops out of the "waiting to be
 * invoiced" list, payables and supplier ranking.
 */
export async function settleOpenQuotes(db: Db): Promise<number> {
  const { data: quotes } = await db
    .from("supplier_invoices")
    .select("id")
    .eq("doc_type", "quote")
    .eq("status", "quoted")
    .is("deleted_at", null)
    .limit(1000)
  const quoteIds = (quotes ?? []).map((q) => q.id as string)
  if (!quoteIds.length) return 0

  const jobsByQuote = new Map<string, Set<string>>()
  const converted = new Set<string>()
  for (const ids of chunks(quoteIds)) {
    const [{ data: items }, { data: conv }] = await Promise.all([
      db.from("supplier_invoice_items").select("invoice_id, job_id").in("invoice_id", ids).not("job_id", "is", null),
      db.from("supplier_invoices").select("source_quote_id").in("source_quote_id", ids).is("deleted_at", null),
    ])
    for (const it of items ?? []) {
      const set = jobsByQuote.get(it.invoice_id as string) ?? new Set<string>()
      set.add(it.job_id as string)
      jobsByQuote.set(it.invoice_id as string, set)
    }
    for (const c of conv ?? []) converted.add(c.source_quote_id as string)
  }

  const jobIds = [...new Set([...jobsByQuote.values()].flatMap((s) => [...s]))]
  const doneJobs = new Set<string>()
  for (const ids of chunks(jobIds)) {
    const [{ data: finished }, { data: billed }, { data: custInv }] = await Promise.all([
      db.from("jobs").select("id").in("id", ids).in("stage", FINISHED_STAGES),
      db
        .from("supplier_invoice_items")
        .select("job_id, supplier_invoices!inner(doc_type, status, deleted_at)")
        .in("job_id", ids)
        .eq("supplier_invoices.doc_type", "invoice")
        .eq("supplier_invoices.status", "confirmed")
        .is("supplier_invoices.deleted_at", null),
      db.from("invoices").select("job_id, status, total, amount_paid").in("job_id", ids),
    ])
    for (const j of finished ?? []) doneJobs.add(j.id as string)
    for (const b of billed ?? []) doneJobs.add(b.job_id as string)
    for (const ci of custInv ?? []) {
      const total = Number(ci.total) || 0
      const paid = Number(ci.amount_paid) || 0
      if (ci.status === "paid" || (total > 0 && paid + 0.01 >= total)) doneJobs.add(ci.job_id as string)
    }
  }

  const settle = quoteIds.filter((id) => {
    if (converted.has(id)) return true
    const jobs = jobsByQuote.get(id)
    return !!jobs && [...jobs].some((j) => doneJobs.has(j))
  })
  if (!settle.length) return 0

  const now = new Date().toISOString()
  for (const ids of chunks(settle)) {
    await db.from("supplier_invoices").update({ status: "invoiced", updated_at: now }).in("id", ids).eq("status", "quoted")
  }
  return settle.length
}
