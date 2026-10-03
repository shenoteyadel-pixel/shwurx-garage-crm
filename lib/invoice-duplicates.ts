type InvoiceLike = {
  id: string
  doc_number: string | null
  invoice_number: string | null
  supplier_id: string | null
  supplier_name_raw: string | null
  deleted_at?: string | null
}

const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

export type DuplicateMatch = { id: string; label: string }

/**
 * Groups invoices that share the same invoice number from the same supplier.
 * Returns a map of invoice id -> the other invoices it duplicates.
 */
export function findDuplicateGroups<T extends InvoiceLike>(rows: T[]): Map<string, DuplicateMatch[]> {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    if (r.deleted_at) continue
    const num = norm(r.invoice_number)
    const supplier = r.supplier_id ?? norm(r.supplier_name_raw)
    if (!num || !supplier) continue
    const key = `${supplier}|${num}`
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  const result = new Map<string, DuplicateMatch[]>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    for (const r of list) {
      result.set(
        r.id,
        list.filter((o) => o.id !== r.id).map((o) => ({ id: o.id, label: o.doc_number || o.invoice_number || "draft" })),
      )
    }
  }
  return result
}

export async function loadProfileNames(
  db: { from: (t: string) => any },
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])]
  if (!unique.length) return new Map()
  const { data } = await db.from("profiles").select("id, full_name").in("id", unique)
  return new Map(((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name || "Unknown"]))
}
