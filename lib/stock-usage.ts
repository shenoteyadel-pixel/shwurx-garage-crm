export const STOCK_USAGE_TYPES = ["car", "general", "damaged", "returned", "warranty", "other"] as const
export type StockUsageType = (typeof STOCK_USAGE_TYPES)[number]

export const STOCK_USAGE_LABEL: Record<StockUsageType, string> = {
  car: "Used on a car",
  general: "General workshop use",
  damaged: "Damaged / scrapped",
  returned: "Returned to supplier",
  warranty: "Warranty claim",
  other: "Other",
}

/** Items with stock that have not moved out for this many days are flagged as stuck. */
export const STUCK_STOCK_DAYS = 60
