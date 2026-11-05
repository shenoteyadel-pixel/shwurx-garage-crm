export const TASK_STATUSES = [
  { value: "assigned", label: "Assigned", tone: "neutral" },
  { value: "inspection", label: "Inspection", tone: "info" },
  { value: "in_progress", label: "In progress", tone: "active" },
  { value: "waiting_parts", label: "Waiting for parts", tone: "warn" },
  { value: "waiting_approval", label: "Waiting for approval", tone: "warn" },
  { value: "repair_completed", label: "Repair completed", tone: "done" },
  { value: "qc_pending", label: "QC pending", tone: "info" },
  { value: "qc_approved", label: "QC approved", tone: "done" },
  { value: "qc_rejected", label: "Rework required", tone: "danger" },
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"]

/** Statuses a technician may move their own task into. */
export const TECH_STATUSES: TaskStatus[] = [
  "inspection",
  "in_progress",
  "waiting_parts",
  "waiting_approval",
  "repair_completed",
]

export const TASK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]["value"]

export const PART_CATEGORIES = [
  { value: "oem", label: "OEM" },
  { value: "aftermarket", label: "Aftermarket" },
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
] as const

export const PART_URGENCIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical — car is stopped" },
] as const

export const MEDIA_PHASES = [
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
] as const
export type MediaPhase = (typeof MEDIA_PHASES)[number]["value"]

export type ChecklistItem = { label: string; result: "ok" | "attention" | "fail" | null; note?: string }

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  "Warning lights on dashboard",
  "Fluid levels and leaks",
  "Battery and charging",
  "Tyres and brakes",
  "Suspension and steering",
  "Lights and electrics",
  "Road test",
].map((label) => ({ label, result: null }))

export const ACTIVE_STATUSES: TaskStatus[] = ["assigned", "inspection", "in_progress", "qc_rejected"]
export const WAITING_STATUSES: TaskStatus[] = ["waiting_parts", "waiting_approval"]
export const DONE_STATUSES: TaskStatus[] = ["repair_completed", "qc_pending", "qc_approved"]

export function statusLabel(status: string) {
  return TASK_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function statusTone(status: string) {
  return TASK_STATUSES.find((s) => s.value === status)?.tone ?? "neutral"
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/** Worked time including the currently running segment. */
export function liveSeconds(worked: number, timerStartedAt: string | null, now = Date.now()) {
  if (!timerStartedAt) return worked
  return worked + Math.max(0, Math.floor((now - new Date(timerStartedAt).getTime()) / 1000))
}
