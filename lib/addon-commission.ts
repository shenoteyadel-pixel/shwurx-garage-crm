/**
 * Pure add-on sales commission engine. No I/O: every number is derived from the
 * frozen snapshots stored on the sale row plus the job's invoice/payment state,
 * so the same inputs always produce the same commission.
 */

export type AddonSaleStatus = "draft" | "proposed" | "approved" | "rejected" | "completed" | "cancelled"
export type PartialPolicy = "proportional" | "full_only"

export type CommissionStatus =
  | "proposed"
  | "customer_approved"
  | "work_completed"
  | "invoiced"
  | "payment_pending"
  | "earned"
  | "paid"
  | "reversed"
  | "rejected"
  | "not_eligible"

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  proposed: "Proposed",
  customer_approved: "Customer Approved",
  work_completed: "Work Completed",
  invoiced: "Invoiced",
  payment_pending: "Payment Pending",
  earned: "Earned",
  paid: "Paid",
  reversed: "Reversed",
  rejected: "Rejected",
  not_eligible: "Not eligible",
}

export const DEFAULT_COMMISSION_PCT = 25

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type LineInput = {
  quantity: number
  unitPrice: number
  unitCost: number
  unitExtraCost: number
  discount: number
  commissionPct: number
  commissionEligible: boolean
}

export type LineFigures = {
  originalAmount: number
  discount: number
  netAmount: number
  directCost: number
  grossProfit: number
  marginPct: number
  commission: number
}

/** Prices and costs are VAT-exclusive. Commission is on positive gross profit only. */
export function computeLine(i: LineInput): LineFigures {
  const qty = Math.max(0, Number(i.quantity) || 0)
  const originalAmount = round2(qty * Math.max(0, Number(i.unitPrice) || 0))
  const discount = round2(Math.min(Math.max(0, Number(i.discount) || 0), originalAmount))
  const netAmount = round2(originalAmount - discount)
  const directCost = round2(qty * (Math.max(0, Number(i.unitCost) || 0) + Math.max(0, Number(i.unitExtraCost) || 0)))
  const grossProfit = round2(netAmount - directCost)
  const marginPct = netAmount > 0 ? round2((grossProfit / netAmount) * 100) : 0
  const pct = Math.min(100, Math.max(0, Number(i.commissionPct) || 0))
  const commission = i.commissionEligible && grossProfit > 0 ? round2((grossProfit * pct) / 100) : 0
  return { originalAmount, discount, netAmount, directCost, grossProfit, marginPct, commission }
}

export type InvoiceState = {
  status: string
  total: number
  amountPaid: number
} | null

export type CommissionInput = {
  saleStatus: AddonSaleStatus
  line: LineFigures
  invoice: InvoiceState
  hasLivePayout: boolean
  hadPayoutReversed?: boolean
  policy: PartialPolicy
}

export type CommissionResult = {
  status: CommissionStatus
  /** Full commission the line can earn once realized. */
  potential: number
  /** Share of commission recognized given payment received. */
  earned: number
  /** Potential not yet earned, for approved/completed work still in progress. */
  pending: number
  paidRatio: number
}

/** Realized share of revenue: paid ÷ total, capped to [0, 1]. Policy decides how partial payment counts. */
export function paidRatio(invoice: InvoiceState, policy: PartialPolicy): number {
  if (!invoice || invoice.status === "cancelled") return 0
  const total = Number(invoice.total) || 0
  if (total <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (Number(invoice.amountPaid) || 0) / total))
  if (policy === "full_only") return ratio >= 0.999 ? 1 : 0
  return ratio >= 0.999 ? 1 : ratio
}

export function deriveCommission(i: CommissionInput): CommissionResult {
  const potential = i.line.commission
  const none = (status: CommissionStatus): CommissionResult => ({ status, potential, earned: 0, pending: 0, paidRatio: 0 })

  if (i.saleStatus === "rejected") return { ...none("rejected"), potential: 0 }
  if (i.saleStatus === "cancelled") return { ...none("reversed"), potential: 0 }
  if (i.saleStatus === "draft" || i.saleStatus === "proposed") return none("proposed")
  if (potential <= 0) return { ...none("not_eligible"), potential: 0 }
  if (i.saleStatus === "approved") return { ...none("customer_approved"), pending: potential }

  // Completed work from here on.
  if (i.invoice?.status === "cancelled") return { ...none("reversed"), potential: 0 }
  if (i.hasLivePayout) return { status: "paid", potential, earned: potential, pending: 0, paidRatio: 1 }
  if (!i.invoice) return { ...none("work_completed"), pending: potential }

  const ratio = paidRatio(i.invoice, i.policy)
  const rawRatio = Math.min(1, Math.max(0, (Number(i.invoice.amountPaid) || 0) / (Number(i.invoice.total) || 1)))
  const earned = round2(potential * ratio)
  const pending = round2(potential - earned)
  if (ratio >= 1) return { status: "earned", potential, earned, pending: 0, paidRatio: 1 }
  if (rawRatio > 0) return { status: "payment_pending", potential, earned, pending, paidRatio: ratio }
  return { status: "invoiced", potential, earned: 0, pending: potential, paidRatio: 0 }
}

/** Payout is only allowed for fully earned, unpaid commission. */
export function canPayout(r: CommissionResult): boolean {
  return r.status === "earned" && r.earned > 0
}

export type RecommendationInput = {
  mileage: number | null
  jobMake: string | null
  compatibleMakes: string | null
  intervalKm: number | null
  intervalMonths: number | null
  last: { mileage: number | null; date: string } | null
  inspectionText: string
  name: string
  now?: Date
}

export type Recommendation = {
  level: "due" | "flagged" | "ok" | "recent" | "incompatible"
  reason: string
}

export function makeList(s: string | null | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean)
}

/** Ranks how appropriate an add-on is for this vehicle right now. */
export function recommend(i: RecommendationInput): Recommendation {
  const makes = makeList(i.compatibleMakes)
  const make = (i.jobMake ?? "").trim().toLowerCase()
  if (makes.length && make && !makes.includes(make)) {
    return { level: "incompatible", reason: `Not listed for ${i.jobMake}` }
  }

  const now = i.now ?? new Date()
  if (i.last) {
    const months = (now.getTime() - new Date(i.last.date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    const km = i.mileage != null && i.last.mileage != null ? i.mileage - i.last.mileage : null
    const kmDue = i.intervalKm != null && km != null && km >= i.intervalKm
    const monthDue = i.intervalMonths != null && months >= i.intervalMonths
    if (kmDue || monthDue) {
      return { level: "due", reason: kmDue ? `${km!.toLocaleString()} km since last done` : `${Math.floor(months)} months since last done` }
    }
    const since = km != null ? `${km.toLocaleString()} km ago` : `${Math.max(0, Math.floor(months))} months ago`
    return { level: "recent", reason: `Already done ${since}` }
  }

  const words = i.name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["replacement", "system", "engine", "top-up"].includes(w))
  const text = i.inspectionText.toLowerCase()
  if (words.length && words.some((w) => text.includes(w))) {
    return { level: "flagged", reason: "Mentioned in inspection findings" }
  }
  if (i.intervalKm != null && i.mileage != null && i.mileage >= i.intervalKm) {
    return { level: "due", reason: `No record on file, vehicle at ${i.mileage.toLocaleString()} km` }
  }
  return { level: "ok", reason: "No service history on file" }
}

export const RECOMMENDATION_ORDER: Record<Recommendation["level"], number> = {
  flagged: 0,
  due: 1,
  ok: 2,
  recent: 3,
  incompatible: 4,
}
