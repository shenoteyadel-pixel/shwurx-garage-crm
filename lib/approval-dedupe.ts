// Snapshot keys are positional ("it-0", "it-1"…) and every re-sent request
// carries the whole quotation again, so items must be matched by content.
type ItemLike = {
  kind?: string | null
  name?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  labour_hours?: number | string | null
  labour_rate?: number | string | null
  discount?: number | string | null
}

const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100

export function approvalItemSignature(it: ItemLike): string {
  const kind = it.kind === "labor" || it.kind === "service" ? "labor" : "part"
  const name = String(it.name ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  return [kind, name, num(it.quantity), num(it.unit_price), num(it.labour_hours), num(it.labour_rate), num(it.discount)].join("|")
}

type ApprovedRequest<T> = { id: string; decided_at: string | null; items: T[] }

/**
 * Merge approved items from several requests so each real item counts once.
 * The count per signature is the highest seen in any single request, which
 * keeps genuinely repeated lines (two identical parts) while dropping re-sends.
 */
export function mergeApprovedItems<T extends ItemLike>(requests: ApprovedRequest<T>[]) {
  const best = new Map<string, { count: number; items: { item: T; requestId: string; decided_at: string | null }[] }>()
  for (const req of requests) {
    const local = new Map<string, T[]>()
    for (const it of req.items) {
      const sig = approvalItemSignature(it)
      const list = local.get(sig) ?? []
      list.push(it)
      local.set(sig, list)
    }
    for (const [sig, list] of local) {
      const current = best.get(sig)
      if (!current || list.length > current.count) {
        const kept = current?.items ?? []
        const extra = list.slice(kept.length).map((item) => ({ item, requestId: req.id, decided_at: req.decided_at }))
        best.set(sig, { count: list.length, items: [...kept, ...extra] })
      }
    }
  }
  const counts = new Map<string, number>()
  const merged: { item: T; requestId: string; decided_at: string | null }[] = []
  for (const [sig, entry] of best) {
    counts.set(sig, entry.count)
    merged.push(...entry.items)
  }
  return { merged, counts }
}

/** Keys of items in the current request that were already approved earlier. */
export function alreadyApprovedKeys<T extends ItemLike & { key: string }>(items: T[], counts: Map<string, number>) {
  const remaining = new Map(counts)
  const keys: string[] = []
  for (const it of items) {
    const sig = approvalItemSignature(it)
    const left = remaining.get(sig) ?? 0
    if (left > 0) {
      keys.push(it.key)
      remaining.set(sig, left - 1)
    }
  }
  return keys
}
