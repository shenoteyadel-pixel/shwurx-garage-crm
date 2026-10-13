export const CLOSE_REASONS = [
  { key: "customer_took_car", label: "Customer took the car back" },
  { key: "customer_declined", label: "Customer declined the quotation" },
  { key: "duplicate", label: "Duplicate / opened by mistake" },
  { key: "other", label: "Other" },
] as const

export type CloseReason = (typeof CLOSE_REASONS)[number]["key"]

export function isCloseReason(v: unknown): v is CloseReason {
  return CLOSE_REASONS.some((r) => r.key === v)
}

export function closeReasonLabel(v: string | null | undefined): string {
  return CLOSE_REASONS.find((r) => r.key === v)?.label ?? "Deleted"
}
