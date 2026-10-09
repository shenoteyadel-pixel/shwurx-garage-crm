import "server-only"
import type { createClient } from "@/lib/supabase/server"
import { findDuplicateParts, normPart, type CostLookup, type DuplicateGroup } from "@/lib/quote-duplicates"

type Supabase = Awaited<ReturnType<typeof createClient>>

type RawItem = Parameters<typeof findDuplicateParts>[0] extends (infer A)[] | null | undefined ? A : never

const num = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const setIfPositive = (map: Map<string, number>, key: string, cost: number) => {
  if (key && cost > 0 && !map.has(key)) map.set(key, cost)
}

/**
 * Builds a per-unit cost lookup for a job's parts: what was actually paid on
 * supplier invoices for this job first, then the cost entered on the parts
 * request, then the stock cost price.
 */
async function loadCostLookup(supabase: Supabase, jobId: string, names: string[], partNumbers: string[]): Promise<CostLookup> {
  const purchase = new Map<string, number>()
  const request = new Map<string, number>()
  const stock = new Map<string, number>()

  const rawNames = [...new Set(names.filter(Boolean))]
  const rawPns = [...new Set(partNumbers.filter(Boolean))]

  const [invoiceRes, requestRes, bySku, byOem, byName] = await Promise.all([
    supabase
      .from("supplier_invoice_items")
      .select("description, sku, oem_part_number, supplier_part_number, unit_cost, inventory_item_id")
      .eq("job_id", jobId),
    supabase.from("parts_requests").select("part_name, cost").eq("job_id", jobId).is("deleted_at", null),
    rawPns.length
      ? supabase.from("inventory_items").select("id, name, sku, oem_part_number, cost_price").in("sku", rawPns)
      : Promise.resolve({ data: [] as any[] }),
    rawPns.length
      ? supabase.from("inventory_items").select("id, name, sku, oem_part_number, cost_price").in("oem_part_number", rawPns)
      : Promise.resolve({ data: [] as any[] }),
    rawNames.length
      ? supabase.from("inventory_items").select("id, name, sku, oem_part_number, cost_price").in("name", rawNames)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const invoiceRows = (invoiceRes.data as any[]) ?? []
  const linkedIds = [...new Set(invoiceRows.map((r) => r.inventory_item_id).filter(Boolean))]
  const { data: linkedStock } = linkedIds.length
    ? await supabase.from("inventory_items").select("id, name, sku, oem_part_number").in("id", linkedIds)
    : { data: [] as any[] }
  const stockById = new Map(((linkedStock as any[]) ?? []).map((s) => [s.id, s]))

  for (const r of invoiceRows) {
    const cost = num(r.unit_cost)
    const linked = r.inventory_item_id ? stockById.get(r.inventory_item_id) : null
    for (const pn of [r.sku, r.oem_part_number, r.supplier_part_number, linked?.sku, linked?.oem_part_number]) {
      setIfPositive(purchase, `pn:${normPart(pn)}`, cost)
    }
    for (const nm of [r.description, linked?.name]) setIfPositive(purchase, `nm:${normPart(nm)}`, cost)
  }

  for (const r of (requestRes.data as any[]) ?? []) setIfPositive(request, `nm:${normPart(r.part_name)}`, num(r.cost))

  for (const r of [...((bySku.data as any[]) ?? []), ...((byOem.data as any[]) ?? []), ...((byName.data as any[]) ?? [])]) {
    const cost = num(r.cost_price)
    setIfPositive(stock, `pn:${normPart(r.sku)}`, cost)
    setIfPositive(stock, `pn:${normPart(r.oem_part_number)}`, cost)
    setIfPositive(stock, `nm:${normPart(r.name)}`, cost)
  }

  return ({ name, partNumber }) => {
    const pnKey = partNumber ? `pn:${normPart(partNumber)}` : ""
    const nmKey = `nm:${normPart(name)}`
    const hit = (map: Map<string, number>) => (pnKey && map.get(pnKey)) || map.get(nmKey) || 0
    const p = hit(purchase)
    if (p) return { unitCost: p, source: "purchase" }
    const r = hit(request)
    if (r) return { unitCost: r, source: "request" }
    const s = hit(stock)
    if (s) return { unitCost: s, source: "stock" }
    return null
  }
}

/** Duplicate part groups on a job card, each ranked by profit. */
export async function findJobDuplicateParts(
  supabase: Supabase,
  jobId: string,
  items: RawItem[] | null | undefined,
): Promise<DuplicateGroup[]> {
  const plain = findDuplicateParts(items)
  if (plain.length === 0) return []
  const lines = plain.flatMap((g) => g.lines)
  const costOf = await loadCostLookup(
    supabase,
    jobId,
    lines.map((l) => l.name.trim()),
    lines.map((l) => l.partNumber.trim()),
  )
  return findDuplicateParts(items, costOf)
}
