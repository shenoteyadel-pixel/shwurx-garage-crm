import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { getJobApprovals, samePart, type ApprovedPart } from "@/lib/quote-invoice"

export type OrderLineStatus = "needs_quote" | "to_order" | "invoice_draft" | "received"

export type OrderLine = ApprovedPart & {
  status: OrderLineStatus
  supplier: string | null
  quoteLabel: string | null
}

export type OpenQuote = { id: string; label: string; supplier: string | null; invoiceId: string | null; invoiceLabel: string | null }

export type ApprovedJob = {
  jobId: string
  jobNumber: string | null
  vehicle: string
  plate: string | null
  customer: string | null
  status: "approved" | "partial"
  decidedAt: string | null
  lines: OrderLine[]
  declined: ApprovedPart[]
  quotes: OpenQuote[]
}

type DocRow = {
  id: string
  doc_type: string | null
  status: string
  doc_number: string | null
  invoice_number: string | null
  supplier_name_raw: string | null
  source_quote_id: string | null
  deleted_at: string | null
  suppliers: { name: string | null } | { name: string | null }[] | null
}

type ItemRow = {
  job_id: string | null
  description: string | null
  oem_part_number: string | null
  supplier_part_number: string | null
  match_status: string | null
  supplier_invoices: DocRow | DocRow[] | null
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

/**
 * Every car whose customer has approved the quotation and is still in the
 * workshop, with exactly the parts they approved and where each one stands:
 * needs a supplier quote, quoted and waiting for the invoice, invoice in draft,
 * or received.
 */
export async function loadApprovedToOrder(): Promise<ApprovedJob[]> {
  const db = createServiceClient()
  const { data: jobs } = await db
    .from("jobs")
    .select("id, job_number, vehicle_make, vehicle_model, plate_number, customer_name, stage")
    .neq("stage", "delivered")
    .order("created_at", { ascending: false })
    .limit(300)
  const jobList = jobs ?? []
  const approvals = await getJobApprovals(
    db,
    jobList.map((j) => j.id as string),
  )
  const approvedJobs = jobList.filter((j) => approvals.has(j.id as string))
  if (!approvedJobs.length) return []

  const { data: itemRows } = await db
    .from("supplier_invoice_items")
    .select(
      "job_id, description, oem_part_number, supplier_part_number, match_status, supplier_invoices!inner(id, doc_type, status, doc_number, invoice_number, supplier_name_raw, source_quote_id, deleted_at, suppliers(name))",
    )
    .in(
      "job_id",
      approvedJobs.map((j) => j.id as string),
    )
  const items = ((itemRows ?? []) as unknown as ItemRow[])
    .map((r) => ({ ...r, doc: one(r.supplier_invoices) }))
    .filter((r) => r.doc && !r.doc.deleted_at && r.match_status !== "ignore")

  const supplierOf = (d: DocRow) => one(d.suppliers)?.name ?? d.supplier_name_raw ?? null
  const labelOf = (d: DocRow) => d.doc_number || d.invoice_number || (d.doc_type === "quote" ? "Supplier quote" : "Draft invoice")

  // Invoices that were created from (or auto-linked to) a quote, by quote id.
  const quoteIds = [...new Set(items.filter((i) => i.doc!.doc_type === "quote").map((i) => i.doc!.id))]
  const invoiceForQuote = new Map<string, { id: string; label: string }>()
  if (quoteIds.length) {
    const { data: linked } = await db
      .from("supplier_invoices")
      .select("id, doc_number, invoice_number, status, source_quote_id")
      .in("source_quote_id", quoteIds)
      .is("deleted_at", null)
    for (const l of linked ?? []) {
      invoiceForQuote.set(l.source_quote_id as string, {
        id: l.id as string,
        label: (l.doc_number as string | null) || (l.invoice_number as string | null) || "Draft invoice",
      })
    }
  }

  return approvedJobs.map((j) => {
    const a = approvals.get(j.id as string)!
    const jobItems = items.filter((i) => i.job_id === j.id)
    const lines: OrderLine[] = a.approved.map((p) => {
      const matches = jobItems.filter((i) => samePart(p, i))
      const received = matches.find((m) => m.doc!.doc_type !== "quote" && m.doc!.status === "confirmed")
      const draft = matches.find((m) => m.doc!.doc_type !== "quote" && m.doc!.status === "draft")
      const quoted = matches.find((m) => m.doc!.doc_type === "quote" && m.doc!.status === "quoted")
      const src = received ?? draft ?? quoted
      return {
        ...p,
        status: received ? "received" : draft ? "invoice_draft" : quoted ? "to_order" : "needs_quote",
        supplier: src ? supplierOf(src.doc!) : null,
        quoteLabel: quoted ? labelOf(quoted.doc!) : null,
      }
    })

    const seen = new Set<string>()
    const quotes: OpenQuote[] = []
    for (const i of jobItems) {
      const d = i.doc!
      if (d.doc_type !== "quote" || d.status !== "quoted" || seen.has(d.id)) continue
      seen.add(d.id)
      const inv = invoiceForQuote.get(d.id)
      quotes.push({ id: d.id, label: labelOf(d), supplier: supplierOf(d), invoiceId: inv?.id ?? null, invoiceLabel: inv?.label ?? null })
    }

    return {
      jobId: j.id as string,
      jobNumber: (j.job_number as string | null) ?? null,
      vehicle: [j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ") || "Vehicle",
      plate: (j.plate_number as string | null) ?? null,
      customer: (j.customer_name as string | null) ?? null,
      status: a.status,
      decidedAt: a.decidedAt,
      lines,
      declined: a.declined,
      quotes,
    }
  })
}
