export type JobType = "repair" | "inspection_only"

export const JOB_TYPES: { value: JobType; label: string; description: string }[] = [
  { value: "repair", label: "Repair / service", description: "Diagnose, quote and repair the vehicle." },
  {
    value: "inspection_only",
    label: "Full inspection only",
    description: "Multi-point inspection and a written report. No repair work.",
  },
]

export type CheckStatus = "good" | "attention" | "urgent" | "na"

export const CHECK_STATUSES: {
  value: CheckStatus
  label: string
  short: string
  hex: string
}[] = [
  { value: "good", label: "Good", short: "OK", hex: "#3f9a0c" },
  {
    value: "attention",
    label: "Needs attention soon",
    short: "Soon",
    hex: "#d97706",
  },
  {
    value: "urgent",
    label: "Urgent / unsafe",
    short: "Urgent",
    hex: "#dc2626",
  },
  { value: "na", label: "Not applicable", short: "N/A", hex: "#9ca3af" },
]

export const CHECK_STATUS_MAP = Object.fromEntries(CHECK_STATUSES.map((s) => [s.value, s])) as Record<
  CheckStatus,
  (typeof CHECK_STATUSES)[number]
>

export type ChecklistSection = { key: string; title: string; items: { key: string; label: string }[] }

export const FULL_INSPECTION_SECTIONS: ChecklistSection[] = [
  {
    key: "engine",
    title: "Engine bay & fluids",
    items: [
      { key: "engine_oil", label: "Engine oil level & condition" },
      { key: "coolant", label: "Coolant level & condition" },
      { key: "brake_fluid", label: "Brake fluid" },
      { key: "transmission_fluid", label: "Transmission fluid / leaks" },
      { key: "belts_hoses", label: "Drive belts & hoses" },
      { key: "battery", label: "Battery health & terminals" },
      { key: "air_filter", label: "Air & cabin filters" },
      { key: "engine_mounts", label: "Engine & gearbox mounts" },
      { key: "engine_leaks", label: "Oil / fluid leaks" },
    ],
  },
  {
    key: "underbody",
    title: "Underbody, suspension & steering",
    items: [
      { key: "shocks", label: "Shock absorbers / air suspension" },
      { key: "arms_bushes", label: "Control arms & bushes" },
      { key: "ball_joints", label: "Ball joints & tie-rod ends" },
      { key: "cv_boots", label: "CV joints & boots" },
      { key: "steering_rack", label: "Steering rack" },
      { key: "exhaust", label: "Exhaust system" },
      { key: "underbody_damage", label: "Underbody damage / corrosion" },
    ],
  },
  {
    key: "brakes_tyres",
    title: "Brakes & tyres",
    items: [
      { key: "front_pads", label: "Front brake pads" },
      { key: "rear_pads", label: "Rear brake pads" },
      { key: "discs", label: "Brake discs" },
      { key: "parking_brake", label: "Parking brake" },
      { key: "tyre_fl", label: "Tyre front left (tread & pressure)" },
      { key: "tyre_fr", label: "Tyre front right (tread & pressure)" },
      { key: "tyre_rl", label: "Tyre rear left (tread & pressure)" },
      { key: "tyre_rr", label: "Tyre rear right (tread & pressure)" },
      { key: "wheels", label: "Wheels / rims" },
    ],
  },
  {
    key: "electrical",
    title: "Electrical & electronics",
    items: [
      { key: "diagnostic_scan", label: "Computer diagnostic scan (fault codes)" },
      { key: "warning_lights", label: "Dashboard warning lights" },
      { key: "exterior_lights", label: "Exterior lights" },
      { key: "interior_lights", label: "Interior lights" },
      { key: "ac", label: "A/C cooling performance" },
      { key: "wipers", label: "Wipers & washers" },
      { key: "windows_mirrors", label: "Windows, mirrors & locks" },
      { key: "infotainment", label: "Infotainment, camera & sensors" },
    ],
  },
  {
    key: "body",
    title: "Body & interior",
    items: [
      { key: "paint_panels", label: "Paint & body panels" },
      { key: "glass", label: "Windscreen & glass" },
      { key: "seats", label: "Seats & upholstery" },
      { key: "seatbelts", label: "Seatbelts & airbag indicators" },
      { key: "doors_boot", label: "Doors, bonnet & boot" },
    ],
  },
  {
    key: "road_test",
    title: "Road test",
    items: [
      { key: "engine_performance", label: "Engine performance & idle" },
      { key: "gear_shifting", label: "Transmission shifting" },
      { key: "braking", label: "Braking performance" },
      { key: "steering_alignment", label: "Steering & alignment" },
      { key: "noise_vibration", label: "Noises & vibration" },
    ],
  },
]

export const ALL_CHECK_ITEMS = FULL_INSPECTION_SECTIONS.flatMap((s) => s.items)
const VALID_ITEM_KEYS = new Set(ALL_CHECK_ITEMS.map((i) => i.key))
const VALID_STATUSES = new Set<string>(CHECK_STATUSES.map((s) => s.value))

export type ChecklistEntry = { status: CheckStatus | null; note: string }
export type Checklist = Record<string, ChecklistEntry>

/** Coerce stored/untrusted JSON into a clean checklist with only known keys. */
export function normalizeChecklist(raw: unknown): Checklist {
  const out: Checklist = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_ITEM_KEYS.has(key) || !value || typeof value !== "object") continue
    const v = value as { status?: unknown; note?: unknown }
    const status = typeof v.status === "string" && VALID_STATUSES.has(v.status) ? (v.status as CheckStatus) : null
    const note = typeof v.note === "string" ? v.note.slice(0, 500) : ""
    if (status || note) out[key] = { status, note }
  }
  return out
}

export function checklistTally(checklist: Checklist) {
  const tally = { good: 0, attention: 0, urgent: 0, na: 0, pending: 0, total: ALL_CHECK_ITEMS.length }
  for (const item of ALL_CHECK_ITEMS) {
    const status = checklist[item.key]?.status
    if (status) tally[status] += 1
    else tally.pending += 1
  }
  return tally
}

/** Overall verdict shown on the report cover. */
export function overallVerdict(checklist: Checklist): { label: string; hex: string } {
  const t = checklistTally(checklist)
  if (t.urgent > 0) return { label: "Requires immediate attention", hex: "#dc2626" }
  if (t.attention > 0) return { label: "Good, with items to monitor", hex: "#d97706" }
  return { label: "Excellent condition", hex: "#3f9a0c" }
}
