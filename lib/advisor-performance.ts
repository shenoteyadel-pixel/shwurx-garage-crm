/**
 * Pure attribution and commission rules for the service advisor performance module.
 * No database access here so the money rules can be unit-tested in isolation.
 */

export const MONEY_CATEGORIES = ["labour", "used_parts", "new_parts"] as const
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number]
export type TargetCategory = MoneyCategory | "reviews"
export const TARGET_CATEGORIES: TargetCategory[] = ["labour", "used_parts", "new_parts", "reviews"]

export const CATEGORY_LABEL: Record<TargetCategory | "addon", string> = {
  labour: "Labour Sales",
  used_parts: "Used Parts Sales",
  new_parts: "New Parts Sales",
  addon: "Add-on Product Sales",
  reviews: "Google Reviews",
}

export const PART_SOURCES = ["genuine", "oem", "aftermarket", "refurbished", "used"] as const
export type PartSource = (typeof PART_SOURCES)[number]
export type PartBuckets = Record<PartSource | "unclassified", "new" | "used">

export const DEFAULT_BUCKETS: PartBuckets = {
  genuine: "new",
  oem: "new",
  aftermarket: "new",
  refurbished: "new",
  used: "used",
  unclassified: "new",
}

export const r2 = (n: number) => Math.round(n * 100) / 100

export function normalizeBuckets(raw: unknown): PartBuckets {
  const out = { ...DEFAULT_BUCKETS }
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(out) as (keyof PartBuckets)[]) {
      const v = (raw as Record<string, unknown>)[key]
      if (v === "new" || v === "used") out[key] = v
    }
  }
  return out
}

export interface InvoiceLine {
  kind: string
  line_total: number
  billing_type?: string | null
  part_source?: string | null
}

export function lineCategory(line: InvoiceLine, buckets: PartBuckets): MoneyCategory | null {
  if (line.billing_type && line.billing_type !== "normal") return null
  if (line.kind === "labour") return "labour"
  if (line.kind !== "part") return null
  const source = (PART_SOURCES as readonly string[]).includes(line.part_source ?? "")
    ? (line.part_source as PartSource)
    : "unclassified"
  return buckets[source] === "used" ? "used_parts" : "new_parts"
}

export type CategoryAmounts = Record<MoneyCategory, number>
const zero = (): CategoryAmounts => ({ labour: 0, used_parts: 0, new_parts: 0 })

export interface InvoiceInput {
  id: string
  job_id: string | null
  advisor_id: string | null
  status: string
  total: number
  discount: number
  items: InvoiceLine[]
  /** Approved add-on value on this job; kept out of these categories so it is only counted once, in Add-on Sales. */
  upsell: number
}

/**
 * Net-of-VAT value per category for a fully paid invoice. The invoice discount and any
 * add-on value are removed pro rata so the categories add up to what the customer pays ex-VAT,
 * minus add-ons.
 */
export function invoiceShares(inv: InvoiceInput, buckets: PartBuckets): CategoryAmounts {
  const gross = zero()
  let lineSum = 0
  for (const line of inv.items) {
    const amount = Number(line.line_total) || 0
    if (amount <= 0) continue
    lineSum += amount
    const cat = lineCategory(line, buckets)
    if (cat) gross[cat] += amount
  }
  if (lineSum <= 0) return zero()
  const qualifying = gross.labour + gross.used_parts + gross.new_parts
  const factor = Math.max(0, lineSum - Math.max(0, inv.discount) - Math.max(0, inv.upsell)) / lineSum
  const out = zero()
  if (qualifying <= 0) return out
  for (const c of MONEY_CATEGORIES) out[c] = gross[c] * factor
  return out
}

export interface PaymentInput {
  id: string
  invoice_id: string
  direction: "in" | "out"
  amount: number
  paid_at: string
}

export interface AttributionRow {
  advisor_id: string | null
  invoice_id: string
  job_id: string | null
  payment_id: string
  day: string
  amounts: CategoryAmounts
}

/**
 * Splits every collected payment (and refund) into its ex-VAT category value.
 * Each payment counts once, on its own date. Refunds reverse value; the running
 * collected amount is clamped to [0, invoice total] so overpayments never add value
 * and reversals never go below zero. Cancelled invoices contribute nothing.
 */
export function attributeCollections(
  invoices: InvoiceInput[],
  payments: PaymentInput[],
  buckets: PartBuckets,
): AttributionRow[] {
  const byId = new Map(invoices.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const grouped = new Map<string, PaymentInput[]>()
  for (const p of payments) {
    if (seen.has(p.id) || !byId.has(p.invoice_id)) continue
    seen.add(p.id)
    const list = grouped.get(p.invoice_id) ?? []
    list.push(p)
    grouped.set(p.invoice_id, list)
  }

  const rows: AttributionRow[] = []
  for (const [invoiceId, list] of grouped) {
    const inv = byId.get(invoiceId)!
    const total = Number(inv.total) || 0
    if (inv.status === "cancelled" || total <= 0) continue
    const shares = invoiceShares(inv, buckets)
    list.sort((a, b) => a.paid_at.localeCompare(b.paid_at) || a.id.localeCompare(b.id))
    let collected = 0
    for (const p of list) {
      const signed = (p.direction === "out" ? -1 : 1) * Math.abs(Number(p.amount) || 0)
      const next = Math.min(total, Math.max(0, collected + signed))
      const effective = next - collected
      collected = next
      if (effective === 0) continue
      const ratio = effective / total
      const amounts = zero()
      for (const c of MONEY_CATEGORIES) amounts[c] = shares[c] * ratio
      rows.push({
        advisor_id: inv.advisor_id,
        invoice_id: inv.id,
        job_id: inv.job_id,
        payment_id: p.id,
        day: p.paid_at.slice(0, 10),
        amounts,
      })
    }
  }
  return rows
}

export function sumAmounts(rows: { amounts: CategoryAmounts }[]): CategoryAmounts {
  const out = zero()
  for (const r of rows) for (const c of MONEY_CATEGORIES) out[c] += r.amounts[c]
  for (const c of MONEY_CATEGORIES) out[c] = r2(out[c])
  return out
}

export interface TargetRule {
  target: number
  commission_percent: number
  bonus_amount: number
}

export interface Progress {
  target: number
  achieved: number
  remaining: number
  percent: number
  commission: number
  met: boolean
}

/**
 * Commission follows the existing SWURX rule: the percentage is paid on the amount above
 * target, plus an optional fixed bonus once the target is met. Reviews are a count, so they
 * normally use the bonus only.
 */
export function progressFor(rule: TargetRule | undefined, achieved: number): Progress {
  const target = Math.max(0, Number(rule?.target) || 0)
  const pct = Math.max(0, Math.min(100, Number(rule?.commission_percent) || 0))
  const bonus = Math.max(0, Number(rule?.bonus_amount) || 0)
  const value = r2(Math.max(0, achieved))
  const met = target > 0 && value >= target
  const over = target > 0 && pct > 0 && value > target ? ((value - target) * pct) / 100 : 0
  return {
    target,
    achieved: value,
    remaining: r2(Math.max(0, target - value)),
    percent: target > 0 ? Math.round((value / target) * 1000) / 10 : 0,
    commission: r2(over + (met ? bonus : 0)),
    met,
  }
}

export interface ReviewStats {
  eligibleJobs: number
  requested: number
  delivered: number
  verified: number
  coverage: number
  conversion: number
}

/**
 * Coverage (requests / paid jobs) is shown so requests go to every customer, not only
 * satisfied ones. Verified reviews only count when staff matched the review to the request.
 */
export function reviewStats(eligibleJobs: number, requests: { status: string; verified_at: string | null }[]): ReviewStats {
  const requested = requests.length
  const delivered = requests.filter((r) => r.status === "delivered").length
  const verified = requests.filter((r) => r.verified_at).length
  return {
    eligibleJobs,
    requested,
    delivered,
    verified,
    coverage: eligibleJobs > 0 ? Math.round((Math.min(requested, eligibleJobs) / eligibleJobs) * 1000) / 10 : 0,
    conversion: requested > 0 ? Math.round((verified / requested) * 1000) / 10 : 0,
  }
}

/** ISO week start (Monday) for grouping daily rows into weeks. */
export function weekStart(day: string) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export interface TargetLike extends TargetRule {
  scope: "individual" | "team"
  user_id: string | null
  category: string
  month: string
}

export interface CategoryCard extends Progress {
  category: TargetCategory
  hasTarget: boolean
  approved: number | null
}

export interface Scorecard {
  advisorId: string
  name: string
  cards: CategoryCard[]
  estimated: number
  approved: number
}

/** One month's target-vs-actual per advisor and category. */
export function buildScorecards(input: {
  advisors: { id: string; name: string }[]
  rows: { advisor_id: string | null; amounts: CategoryAmounts }[]
  verifiedByAdvisor: Map<string, number>
  targets: TargetLike[]
  approvals: { user_id: string; category: string; amount: number }[]
}): Scorecard[] {
  return input.advisors.map((a) => {
    const achieved = sumAmounts(input.rows.filter((r) => r.advisor_id === a.id))
    const cards = TARGET_CATEGORIES.map((category) => {
      const rule = input.targets.find((t) => t.scope === "individual" && t.user_id === a.id && t.category === category)
      const value = category === "reviews" ? (input.verifiedByAdvisor.get(a.id) ?? 0) : achieved[category]
      const approval = input.approvals.find((x) => x.user_id === a.id && x.category === category)
      return { ...progressFor(rule, value), category, hasTarget: Boolean(rule), approved: approval ? approval.amount : null }
    })
    return {
      advisorId: a.id,
      name: a.name,
      cards,
      estimated: r2(cards.reduce((s, c) => s + c.commission, 0)),
      approved: r2(cards.reduce((s, c) => s + (c.approved ?? 0), 0)),
    }
  })
}

/** Team target per category against the combined achievement of every advisor. */
export function buildTeamCards(
  rows: { amounts: CategoryAmounts }[],
  verifiedTotal: number,
  targets: TargetLike[],
): CategoryCard[] {
  const achieved = sumAmounts(rows)
  return TARGET_CATEGORIES.map((category) => {
    const rule = targets.find((t) => t.scope === "team" && t.category === category)
    const value = category === "reviews" ? verifiedTotal : achieved[category]
    return { ...progressFor(rule, value), category, hasTarget: Boolean(rule), approved: null }
  })
}

export interface BreakdownRow extends CategoryAmounts {
  key: string
  total: number
}

export function breakdown(rows: { day: string; amounts: CategoryAmounts }[], by: "day" | "week" | "month"): BreakdownRow[] {
  const map = new Map<string, CategoryAmounts>()
  for (const r of rows) {
    const key = by === "day" ? r.day : by === "week" ? weekStart(r.day) : r.day.slice(0, 7)
    const acc = map.get(key) ?? { labour: 0, used_parts: 0, new_parts: 0 }
    for (const c of MONEY_CATEGORIES) acc[c] += r.amounts[c]
    map.set(key, acc)
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      key,
      labour: r2(v.labour),
      used_parts: r2(v.used_parts),
      new_parts: r2(v.new_parts),
      total: r2(v.labour + v.used_parts + v.new_parts),
    }))
}
