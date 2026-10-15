export type BillingType = "normal" | "satisfaction" | "warranty"
export type WarrantyUnit = "days" | "months"

export const BILLING_LABELS: Record<BillingType, string> = {
  normal: "Charge customer",
  satisfaction: "Customer satisfaction (free)",
  warranty: "Under warranty (free)",
}

export const FREE_BADGE: Record<Exclude<BillingType, "normal">, string> = {
  satisfaction: "Customer satisfaction — not charged",
  warranty: "Under warranty — not charged",
}

export function isFree(billing: string | null | undefined) {
  return billing === "satisfaction" || billing === "warranty"
}

export function warrantyLabel(value: number | null | undefined, unit: string | null | undefined) {
  if (!value || (unit !== "days" && unit !== "months")) return null
  const word = unit === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "month" : "months"
  return `Warranty: ${value} ${word}`
}
