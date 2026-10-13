import "server-only"
import { generateObject } from "ai"
import { z } from "zod"
import type { createServiceClient } from "@/lib/supabase/server"
import { partDocLink, partMatchScore, partSignature, PART_MATCH_THRESHOLD } from "@/lib/part-match"

type Db = ReturnType<typeof createServiceClient>

type Line = {
  id: string
  kind: string
  name: string | null
  description: string | null
  part_number: string | null
  detail: string | null
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  addon_type: string | null
}

export type ReconcileMerge = {
  quoteLine: string
  invoiceLines: string[]
  quoteAmount: number
  invoiceAmount: number
  kept: "quote" | "invoice"
  finalAmount: number
  matchedBy: "part_number" | "name" | "ai"
}

export type ReconcileResult = { merges: ReconcileMerge[]; removed: number; aiUsed: boolean }

const AI_MODEL = "google/gemini-2.5-flash"
const AI_MIN_CONFIDENCE = 0.8

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const round2 = (v: number) => Math.round(v * 100) / 100
const label = (l: Line) => String(l.name || l.description || "Part")
const normPn = (v: unknown) => String(v ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()

/** Front vs rear or left vs right on the two names means different parts, whatever anyone says. */
function positionsConflict(a: Line, b: Line) {
  const x = partSignature(label(a))
  const y = partSignature(label(b))
  return Boolean((x.axle && y.axle && x.axle !== y.axle) || (x.side && y.side && x.side !== y.side) || x.service !== y.service)
}

const pairSchema = z.object({
  pairs: z.array(
    z.object({
      invoice: z.number().int().describe("Index of the supplier-invoice line"),
      quote: z.number().int().describe("Index of the quote / estimate line it fulfils"),
      confidence: z.number().min(0).max(1),
    }),
  ),
})

async function aiPairs(invoices: Line[], quotes: Line[]): Promise<{ invoice: number; quote: number }[]> {
  const list = (ls: Line[]) =>
    ls.map((l, i) => `${i}. ${label(l)}${l.part_number ? ` [${l.part_number}]` : ""} — qty ${n(l.quantity)} @ ${n(l.unit_price)}`).join("\n")
  const { object } = await generateObject({
    model: AI_MODEL,
    schema: pairSchema,
    prompt: [
      "You are a parts controller in a car workshop. A job card lists parts the customer was quoted and parts the purchaser actually bought on supplier invoices.",
      "The same physical part often appears twice with different wording (abbreviations, brand, 'copy'/'original', LH/RH split, catalogue names).",
      "Pair each invoice line with the quote line it fulfils. Only pair when it is clearly the same part (e.g. 'SP-PAD KIT, DISC BRAKE, FR' = 'Front Brake Pad', 'Oil Pan With Filter & Seal' = 'Gear Filter' on an automatic gearbox service).",
      "Never pair front with rear, left with right, or a labour/service line with a part. Never pair different parts that are merely related (oil vs oil filter, brake pad vs brake disc).",
      "Leave lines unpaired when unsure. Each invoice line may pair with at most one quote line.",
      "",
      "INVOICE LINES:",
      list(invoices),
      "",
      "QUOTE LINES:",
      list(quotes),
    ].join("\n"),
  })
  return object.pairs.filter(
    (p) =>
      p.confidence >= AI_MIN_CONFIDENCE &&
      invoices[p.invoice] &&
      quotes[p.quote] &&
      !positionsConflict(invoices[p.invoice], quotes[p.quote]),
  )
}

async function recomputeTotals(db: Db, quotationId: string) {
  const { data: q } = await db
    .from("quotations")
    .select("vat_rate, vat_inclusive, quotation_items(kind, quantity, unit_price, labour_hours, labour_rate, discount)")
    .eq("id", quotationId)
    .single()
  if (!q) return
  const vatRate = n(q.vat_rate)
  const inclusive = Boolean(q.vat_inclusive)
  type Sums = { parts: number; labor: number; discount: number; vat: number }
  const sums = ((q.quotation_items as Partial<Line>[] | null) ?? []).reduce<Sums>(
    (acc, i) => {
      const hours = n(i.labour_hours)
      const rate = n(i.labour_rate)
      const gross = i.kind === "labor" ? (hours > 0 ? hours * rate : rate) : n(i.quantity) * n(i.unit_price)
      const discount = n(i.discount)
      const base = Math.max(0, gross - discount)
      const net = inclusive ? base / (1 + vatRate / 100) : base
      const vat = inclusive ? base - net : (base * vatRate) / 100
      const contrib = inclusive ? net : gross
      if (i.kind === "labor") acc.labor += contrib
      else acc.parts += contrib
      acc.discount += discount
      acc.vat += vat
      return acc
    },
    { parts: 0, labor: 0, discount: 0, vat: 0 },
  )
  const subtotal = inclusive ? sums.parts + sums.labor : sums.parts + sums.labor - sums.discount
  await db
    .from("quotations")
    .update({
      parts_total: sums.parts,
      labor_total: sums.labor,
      discount_total: sums.discount,
      subtotal,
      vat_amount: sums.vat,
      total: subtotal + sums.vat,
    })
    .eq("id", quotationId)
}

function lineMoney(l: Pick<Line, "quantity" | "unit_price" | "discount">, vatRate: number, inclusive: boolean) {
  const base = Math.max(0, n(l.quantity) * n(l.unit_price) - n(l.discount))
  const net = inclusive ? base / (1 + vatRate / 100) : base
  const vat = inclusive ? base - net : (base * vatRate) / 100
  return { vat, lineTotal: inclusive ? base : base + vat }
}

/**
 * Removes the same part showing on a job card twice — once from the supplier
 * quote / estimate and again from the supplier invoice. Each invoice line is
 * paired with the quote line it fulfils (part number, then workshop-aware name
 * matching, then AI for the rest). The invoice line stays (it carries the bill
 * reference) and the quote line goes, at whichever amount is higher.
 */
export async function reconcileJobParts(db: Db, jobId: string, opts: { useAI?: boolean } = {}): Promise<ReconcileResult> {
  const { data: quote } = await db
    .from("quotations")
    .select(
      "id, vat_rate, vat_inclusive, quotation_items(id, kind, name, description, part_number, detail, quantity, unit_price, labour_hours, labour_rate, discount, addon_type)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!quote) return { merges: [], removed: 0, aiUsed: false }

  const vatRate = n(quote.vat_rate)
  const inclusive = Boolean(quote.vat_inclusive)
  const parts = ((quote.quotation_items as Line[] | null) ?? []).filter(
    (l) => l.kind !== "labor" && l.kind !== "service" && !l.addon_type && n(l.quantity) > 0,
  )
  const invoices = parts.filter((l) => partDocLink(l.detail) === "bill")
  const quotes = parts.filter((l) => partDocLink(l.detail) !== "bill")
  if (!invoices.length || !quotes.length) return { merges: [], removed: 0, aiUsed: false }

  const remaining = new Map(quotes.map((q) => [q.id, n(q.quantity)]))
  const groups = new Map<string, { invoices: Line[]; qty: number; by: ReconcileMerge["matchedBy"] }>()
  const assign = (inv: Line, q: Line, by: ReconcileMerge["matchedBy"]) => {
    const take = Math.min(n(inv.quantity), remaining.get(q.id) ?? 0)
    if (take <= 0) return false
    remaining.set(q.id, (remaining.get(q.id) ?? 0) - take)
    const g = groups.get(q.id) ?? { invoices: [], qty: 0, by }
    g.invoices.push(inv)
    g.qty += take
    if (by === "ai") g.by = "ai"
    groups.set(q.id, g)
    return true
  }

  const unpaired: Line[] = []
  for (const inv of invoices) {
    const pn = normPn(inv.part_number)
    const open = quotes.filter((q) => (remaining.get(q.id) ?? 0) > 0)
    const byPn = pn ? open.find((q) => normPn(q.part_number) === pn) : undefined
    if (byPn && assign(inv, byPn, "part_number")) continue
    let best: Line | null = null
    let bestScore = 0
    for (const q of open) {
      const qpn = normPn(q.part_number)
      if (pn && qpn && qpn !== pn) continue
      const s = partMatchScore(label(inv), label(q))
      if (s >= PART_MATCH_THRESHOLD && s > bestScore) {
        best = q
        bestScore = s
      }
    }
    if (best && assign(inv, best, "name")) continue
    unpaired.push(inv)
  }

  let aiUsed = false
  const openQuotes = quotes.filter((q) => (remaining.get(q.id) ?? 0) > 0)
  if (opts.useAI && unpaired.length && openQuotes.length) {
    try {
      const pairs = await aiPairs(unpaired, openQuotes)
      aiUsed = true
      for (const p of pairs) assign(unpaired[p.invoice], openQuotes[p.quote], "ai")
    } catch (e) {
      console.error("[reconcileJobParts] AI pairing failed", e)
    }
  }

  const merges: ReconcileMerge[] = []
  let removed = 0
  const byId = new Map(quotes.map((q) => [q.id, q]))
  for (const [quoteId, g] of groups) {
    const q = byId.get(quoteId)!
    const quoteAmount = round2(n(q.unit_price) * g.qty)
    const invoiceAmount = round2(g.invoices.reduce((s, i) => s + n(i.unit_price) * n(i.quantity), 0))
    const keepQuote = quoteAmount > invoiceAmount && invoiceAmount > 0
    if (keepQuote) {
      // Spread the higher quoted amount across the invoice lines in proportion to their own value.
      const factor = quoteAmount / invoiceAmount
      for (const inv of g.invoices) {
        const unit = round2(n(inv.unit_price) * factor)
        const m = lineMoney({ ...inv, unit_price: unit }, vatRate, inclusive)
        await db.from("quotation_items").update({ unit_price: unit, vat: m.vat, line_total: m.lineTotal }).eq("id", inv.id)
        inv.unit_price = unit
      }
    }
    const left = n(q.quantity) - g.qty
    if (left <= 0) {
      await db.from("quotation_items").delete().eq("id", q.id)
      removed++
    } else {
      const m = lineMoney({ ...q, quantity: left }, vatRate, inclusive)
      await db.from("quotation_items").update({ quantity: left, vat: m.vat, line_total: m.lineTotal }).eq("id", q.id)
    }
    merges.push({
      quoteLine: label(q),
      invoiceLines: g.invoices.map(label),
      quoteAmount,
      invoiceAmount,
      kept: keepQuote ? "quote" : "invoice",
      finalAmount: Math.max(quoteAmount, invoiceAmount),
      matchedBy: g.by,
    })
  }

  if (merges.length) await recomputeTotals(db, quote.id)
  return { merges, removed, aiUsed }
}
