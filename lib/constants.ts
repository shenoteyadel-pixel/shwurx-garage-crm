export type Stage =
  | "check_in"
  | "inspection"
  | "quotation"
  | "customer_approval"
  | "parts_required"
  | "parts_ordered"
  | "parts_received"
  | "repair"
  | "quality_control"
  | "ready_for_delivery"
  | "delivered"

export interface StageMeta {
  key: Stage
  label: string
  short: string
  /** tailwind classes for the accent color of this stage */
  dot: string
  text: string
  chip: string
}

export const STAGES: StageMeta[] = [
  { key: "check_in", label: "Check-In", short: "Check-In", dot: "bg-sky-400", text: "text-sky-300", chip: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { key: "inspection", label: "Inspection", short: "Inspect", dot: "bg-cyan-400", text: "text-cyan-300", chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  { key: "quotation", label: "Quotation", short: "Quote", dot: "bg-indigo-400", text: "text-indigo-300", chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  { key: "customer_approval", label: "Customer Approval", short: "Approval", dot: "bg-amber-400", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { key: "parts_required", label: "Parts Required", short: "Parts Req", dot: "bg-orange-400", text: "text-orange-300", chip: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "parts_ordered", label: "Parts Ordered", short: "Ordered", dot: "bg-yellow-400", text: "text-yellow-300", chip: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  { key: "parts_received", label: "Parts Received", short: "Received", dot: "bg-lime-400", text: "text-lime-300", chip: "bg-lime-500/15 text-lime-300 border-lime-500/30" },
  { key: "repair", label: "Repair", short: "Repair", dot: "bg-fuchsia-400", text: "text-fuchsia-300", chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  { key: "quality_control", label: "Quality Control", short: "QC", dot: "bg-purple-400", text: "text-purple-300", chip: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { key: "ready_for_delivery", label: "Ready for Delivery", short: "Ready", dot: "bg-emerald-400", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "delivered", label: "Delivered", short: "Delivered", dot: "bg-neutral-400", text: "text-neutral-300", chip: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
]

export const STAGE_MAP: Record<Stage, StageMeta> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<Stage, StageMeta>

export const STAGE_ORDER: Stage[] = STAGES.map((s) => s.key)

export function nextStage(stage: Stage): Stage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

export function prevStage(stage: Stage): Stage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i > 0 ? STAGE_ORDER[i - 1] : null
}

export const ROLES = [
  { value: "advisor", label: "Service Advisor" },
  { value: "technician", label: "Technician" },
  { value: "parts", label: "Parts Person" },
  { value: "admin", label: "Admin / Manager" },
]

export const PART_STATUSES = [
  { value: "required", label: "Required", chip: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { value: "ordered", label: "Ordered", chip: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  { value: "received", label: "Received", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { value: "backordered", label: "Backordered", chip: "bg-red-500/15 text-red-300 border-red-500/30" },
]

export const VAT_RATE = 5

// Roles allowed to see financial values (prices, totals, profit).
// Technicians are intentionally excluded — they see repair info only.
export const PRICE_ROLES = ["admin", "management", "advisor", "accounts", "parts"]

export function canViewPrices(role: string | null | undefined): boolean {
  if (!role) return false
  return role !== "technician"
}

export const QC_STATUSES = [
  { value: "pending", label: "Pending", chip: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  { value: "in_progress", label: "In Progress", chip: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { value: "passed", label: "Passed", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { value: "failed", label: "Failed", chip: "bg-red-500/15 text-red-300 border-red-500/30" },
]
