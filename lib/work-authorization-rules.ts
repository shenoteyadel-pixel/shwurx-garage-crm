import { STAGE_ORDER, type Stage } from "@/lib/constants"

export type WorkScope = "start_work" | "order_parts"

export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  start_work: "Start work",
  order_parts: "Order parts",
}

export const OVERRIDE_HOURS = 24

const PARTS_ORDER_STAGES: Stage[] = ["parts_ordered", "parts_received"]

/**
 * Which authorization a stage move needs. Moving a car into repair (or any later
 * stage) from before repair starts work; moving it to ordered/received orders parts.
 * Moves backwards or within the same phase need nothing.
 */
export function requiredScopeForMove(from: Stage | null | undefined, to: Stage): WorkScope | null {
  const repairIndex = STAGE_ORDER.indexOf("repair")
  const fromIndex = from ? STAGE_ORDER.indexOf(from) : -1
  const toIndex = STAGE_ORDER.indexOf(to)
  if (toIndex >= repairIndex && fromIndex < repairIndex) return "start_work"
  if (PARTS_ORDER_STAGES.includes(to) && !PARTS_ORDER_STAGES.includes(from as Stage) && fromIndex < repairIndex) {
    return "order_parts"
  }
  return null
}

export type OverrideRow = {
  scope: string
  expires_at: string
  revoked_at: string | null
}

export function isOverrideActive(row: OverrideRow, scope: WorkScope, now: Date = new Date()): boolean {
  return row.scope === scope && !row.revoked_at && new Date(row.expires_at).getTime() > now.getTime()
}

export function validateOverrideReason(reason: string): string | null {
  const text = reason.trim()
  if (text.length < 10) return "Explain the emergency in at least 10 characters."
  if (text.length > 1000) return "Keep the reason under 1000 characters."
  return null
}
