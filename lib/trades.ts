export type Trade = "mechanic" | "painter" | "denter" | "electrician" | "detailer" | "other"

export const TRADES: { value: Trade; label: string }[] = [
  { value: "mechanic", label: "Mechanic" },
  { value: "painter", label: "Painter" },
  { value: "denter", label: "Denter" },
  { value: "electrician", label: "Electrician" },
  { value: "detailer", label: "Detailer" },
  { value: "other", label: "Other" },
]

export const TRADE_VALUES = TRADES.map((t) => t.value)

export function tradeLabel(t: string | null | undefined) {
  return TRADES.find((x) => x.value === t)?.label ?? "Technician"
}

/** Best guess of a person's trade from their job title. */
export function tradeFromTitle(title: string | null | undefined): Trade {
  const t = (title ?? "").toLowerCase()
  if (t.includes("paint")) return "painter"
  if (t.includes("dent") || t.includes("body")) return "denter"
  if (t.includes("electr")) return "electrician"
  if (t.includes("detail") || t.includes("wash") || t.includes("polish")) return "detailer"
  return "mechanic"
}

export type PhotoKind =
  | "vehicle"
  | "problem"
  | "damage"
  | "parts"
  | "old_part"
  | "new_part"
  | "before"
  | "after"
  | "document"
  | "other"

export const PHOTO_KINDS: PhotoKind[] = [
  "vehicle",
  "problem",
  "damage",
  "parts",
  "old_part",
  "new_part",
  "before",
  "after",
  "document",
  "other",
]

export const PHOTO_CATEGORIES: { key: PhotoKind; label: string; hint: string; damage?: boolean }[] = [
  { key: "vehicle", label: "Vehicle", hint: "Exterior / general car shots" },
  { key: "problem", label: "Problem / Fault", hint: "The fault found during diagnosis", damage: true },
  { key: "old_part", label: "Old parts", hint: "Parts removed from the car" },
  { key: "new_part", label: "New parts", hint: "New parts fitted to the car" },
  { key: "before", label: "Before work", hint: "Paint / body area before starting", damage: true },
  { key: "after", label: "After work", hint: "Finished paint / body result" },
  { key: "damage", label: "Damage / Inspection", hint: "Damage and inspection photos", damage: true },
  { key: "parts", label: "Parts (other)", hint: "Other part or component photos" },
  { key: "document", label: "Documents", hint: "Registration, insurance, paperwork" },
  { key: "other", label: "Other", hint: "Anything else" },
]

/** Photo categories a technician of this trade may upload to. */
export function photoKindsForTrade(trade: Trade): PhotoKind[] {
  switch (trade) {
    case "mechanic":
    case "electrician":
      return ["problem", "old_part", "new_part"]
    case "painter":
    case "denter":
    case "detailer":
      return ["before", "after"]
    default:
      return ["before", "after", "other"]
  }
}

/** Trades that work through the diagnosis report. */
export function tradeUsesDiagnosis(trade: Trade) {
  return trade === "mechanic" || trade === "electrician"
}
