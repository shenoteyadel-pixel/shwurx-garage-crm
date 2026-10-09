export type CostSource = "purchase" | "request" | "stock"

export type PartCost = { unitCost: number; source: CostSource }

export type DuplicateLine = {
  id: string
  name: string
  partNumber: string
  detail: string
  quantity: number
  unitPrice: number
  fromInvoice: boolean
  /** Per-unit cost used for the profit figure, or null when nothing is known. */
  unitCost: number | null
  costSource: CostSource | null
  revenue: number
  profit: number | null
}

export type DuplicateGroup = {
  key: string
  lines: DuplicateLine[]
  /** Line kept by default: highest profit, then purchase-invoice line, then the first. */
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

export type CostLookup = (line: { name: string; partNumber: string; fromInvoice: boolean }) => PartCost | null

export const normPart = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ")

export const isInvoiceLinked = (detail: unknown) => /supplier invoice/i.test(String(detail ?? ""))

const SOURCE_RANK: Record<CostSource, number> = { purchase: 0, request: 1, stock: 2 }

/**
 * Groups job-card part lines that describe the same part — same name or same
 * part number — and ranks each group by profit so the most profitable line is
 * kept. Lines without their own cost borrow the group's best-known cost, since
 * they refer to the same physical part.
 */
export function findDuplicateParts(items: RawItem[] | null | undefined, costOf?: CostLookup): DuplicateGroup[] {
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
    const name = normPart(p.name || p.description)
    const pn = normPart(p.part_number)
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

  const groups = new Map<number, { line: DuplicateLine; own: PartCost | null }[]>()
  parts.forEach((p, i) => {
    const root = find(i)
    const list = groups.get(root) ?? []
    const name = String(p.name || p.description || "Part")
    const partNumber = String(p.part_number ?? "")
    const fromInvoice = isInvoiceLinked(p.detail)
    const quantity = Number(p.quantity) || 0
    const unitPrice = Number(p.unit_price) || 0
    list.push({
      line: {
        id: String(p.id),
        name,
        partNumber,
        detail: String(p.detail ?? ""),
        quantity,
        unitPrice,
        fromInvoice,
        unitCost: null,
        costSource: null,
        revenue: quantity * unitPrice,
        profit: null,
      },
      own: costOf ? costOf({ name, partNumber, fromInvoice }) : null,
    })
    groups.set(root, list)
  })

  return [...groups.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => {
      const shared = entries
        .map((e) => e.own)
        .filter((c): c is PartCost => c !== null)
        .sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source])[0]

      const lines = entries.map(({ line, own }) => {
        const cost = own ?? shared ?? null
        return {
          ...line,
          unitCost: cost ? cost.unitCost : null,
          costSource: cost ? cost.source : null,
          profit: cost ? line.quantity * (line.unitPrice - cost.unitCost) : null,
        }
      })

      const score = (l: DuplicateLine) => l.profit ?? l.revenue
      const best = [...lines].sort(
        (a, b) => score(b) - score(a) || Number(b.fromInvoice) - Number(a.fromInvoice),
      )[0]

      return {
        key: lines.map((l) => l.id).sort().join("|"),
        lines,
        defaultKeepId: best.id,
      }
    })
}
