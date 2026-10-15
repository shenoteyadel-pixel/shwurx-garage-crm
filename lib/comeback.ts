export const COMEBACK_RESPONSIBILITIES = [
  { value: "technician", label: "Technician", hint: "Repair not done right" },
  { value: "advisor", label: "Service advisor", hint: "Wrong diagnosis, missed item or bad communication" },
  { value: "both", label: "Advisor + technician", hint: "Shared fault" },
  { value: "parts", label: "Parts / supplier", hint: "Faulty or wrong part" },
  { value: "customer", label: "Customer", hint: "New issue or customer misuse" },
  { value: "none", label: "Not decided", hint: "Still under review" },
] as const

export type ComebackResponsibility = (typeof COMEBACK_RESPONSIBILITIES)[number]["value"]

export function isComebackResponsibility(v: unknown): v is ComebackResponsibility {
  return COMEBACK_RESPONSIBILITIES.some((r) => r.value === v)
}

export function comebackResponsibilityLabel(v: string | null | undefined) {
  return COMEBACK_RESPONSIBILITIES.find((r) => r.value === v)?.label ?? "Not decided"
}

/** Who carries a comeback against their record. */
export function blamesAdvisor(v: string | null | undefined) {
  return v === "advisor" || v === "both"
}
export function blamesTechnician(v: string | null | undefined) {
  return v === "technician" || v === "both"
}
