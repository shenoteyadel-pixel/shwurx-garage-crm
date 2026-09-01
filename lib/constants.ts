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
  | "washing"
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
  { key: "washing", label: "Washing & Detailing", short: "Wash", dot: "bg-teal-400", text: "text-teal-300", chip: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
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

/* ---------------- Car Flow (workshop zones) ---------------- */
// Each zone is a physical workshop area that groups one or more pipeline stages.
export interface Zone {
  key: string
  label: string
  short: string
  stages: Stage[]
  accent: string // tailwind text/border accent
  bar: string // tailwind bg for the column header bar
}

export const ZONES: Zone[] = [
  { key: "reception", label: "Reception & Inspection", short: "Reception", stages: ["check_in", "inspection"], accent: "text-sky-300 border-sky-500/30", bar: "bg-sky-500" },
  { key: "estimation", label: "Estimation & Approval", short: "Estimation", stages: ["quotation", "customer_approval"], accent: "text-amber-300 border-amber-500/30", bar: "bg-amber-500" },
  { key: "parts", label: "Parts & Procurement", short: "Parts", stages: ["parts_required", "parts_ordered", "parts_received"], accent: "text-orange-300 border-orange-500/30", bar: "bg-orange-500" },
  { key: "workshop", label: "Workshop / Repair Bays", short: "Workshop", stages: ["repair"], accent: "text-fuchsia-300 border-fuchsia-500/30", bar: "bg-fuchsia-500" },
  { key: "quality", label: "Quality Control", short: "QC", stages: ["quality_control"], accent: "text-purple-300 border-purple-500/30", bar: "bg-purple-500" },
  { key: "wash", label: "Washing & Detailing", short: "Wash", stages: ["washing"], accent: "text-teal-300 border-teal-500/30", bar: "bg-teal-500" },
  { key: "delivery", label: "Delivery", short: "Delivery", stages: ["ready_for_delivery", "delivered"], accent: "text-emerald-300 border-emerald-500/30", bar: "bg-emerald-500" },
]

// Physical lift bays inside the Workshop zone.
export const LIFT_BAYS = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5", "Bay 6"]

// UAE emirates for structured number plates.
export const UAE_EMIRATES = [
  { value: "Dubai", label: "Dubai" },
  { value: "Abu Dhabi", label: "Abu Dhabi" },
  { value: "Sharjah", label: "Sharjah" },
  { value: "Ajman", label: "Ajman" },
  { value: "Umm Al Quwain", label: "Umm Al Quwain" },
  { value: "Ras Al Khaimah", label: "Ras Al Khaimah" },
  { value: "Fujairah", label: "Fujairah" },
]

// Common suggestions for the free-text vehicle comboboxes.
export const COMMON_MAKES = [
  "Toyota", "Nissan", "Mercedes-Benz", "BMW", "Audi", "Lexus", "Land Rover", "Range Rover",
  "Porsche", "Ford", "Chevrolet", "Honda", "Hyundai", "Kia", "Mitsubishi", "Volkswagen",
  "Jaguar", "Bentley", "Rolls-Royce", "Ferrari", "Lamborghini", "Maserati", "Tesla",
  "GMC", "Dodge", "Jeep", "Mazda", "Infiniti", "Cadillac", "Volvo", "MINI",
]

export const COMMON_COLORS = [
  "White", "Black", "Silver", "Grey", "Blue", "Red", "Green", "Brown", "Beige",
  "Gold", "Orange", "Yellow", "Maroon", "Navy", "Pearl White", "Obsidian Black",
]

export function zoneForStage(stage: Stage): Zone {
  return ZONES.find((z) => z.stages.includes(stage)) ?? ZONES[0]
}
