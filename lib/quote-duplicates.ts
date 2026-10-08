export type DuplicateLine = {
  id: string
  name: string
  partNumber: string
  detail: string
  quantity: number
  unitPrice: number
  fromInvoice: boolean
}

export type DuplicateGroup = {
  key: string
  lines: DuplicateLine[]
  /** Line kept by default: the one linked to a purchase invoice, else the first. */
  defaultKeepId: string
}

type RawItem = {
  id?: string | null
  kind?: string | null
  name?: string | null
  description?: string | null
  part_number?: string | null
  detail?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  addon_type?: string | null
  sort_order?: number | null
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ")

export const isInvoiceLinked = (detail: unknown) => /supplier invoice/i.test(String(detail ?? ""))

/**
 * Groups job-card part lines that describe the same part — same name or same
 * part number — so staff can keep exactly one of each.
 */
export function findDuplicateParts(items: RawItem[] | null | undefined): DuplicateGroup[] {
  const parts = [...(items ?? [])]
    .filter((i) => i.id && !i.addon_type && i.kind !== "labor" && i.kind !== "service")
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))

  const parent = parts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }

  const byName = new Map<string, number>()
  const byNumber = new Map<string, number>()
  parts.forEach((p, i) => {
    const name = norm(p.name || p.description)
    const pn = norm(p.part_number)
    if (name) {
      const seen = byName.get(name)
      if (seen === undefined) byName.set(name, i)
      else union(i, seen)
    }
    if (pn) {
      const seen = byNumber.get(pn)
      if (seen === undefined) byNumber.set(pn, i)
      else union(i, seen)
    }
  })

  const groups = new Map<number, DuplicateLine[]>()
  parts.forEach((p, i) => {
    const root = find(i)
    const list = groups.get(root) ?? []
    list.push({
      id: String(p.id),
      name: String(p.name || p.description || "Part"),
      partNumber: String(p.part_number ?? ""),
      detail: String(p.detail ?? ""),
      quantity: Number(p.quantity) || 0,
      unitPrice: Number(p.unit_price) || 0,
      fromInvoice: isInvoiceLinked(p.detail),
    })
    groups.set(root, list)
  })

  return [...groups.values()]
    .filter((lines) => lines.length > 1)
    .map((lines) => ({
      key: lines.map((l) => l.id).sort().join("|"),
      lines,
      defaultKeepId: (lines.find((l) => l.fromInvoice) ?? lines[0]).id,
    }))
}
