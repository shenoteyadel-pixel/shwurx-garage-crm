// Labour-hours reporting: classify free-text labour categories into the five
// workshop departments the garage tracks, and shape the aggregation results.

export type DepartmentKey = "mechanical" | "electrical" | "paint" | "dent" | "programming"

export type DepartmentDef = {
  key: DepartmentKey
  label: string
  // A single load-bearing hue per department so the bars/dots stay distinguishable.
  bar: string
  dot: string
}

// Order matters: the classifier tests the most specific departments first so a
// line like "ECU programming" lands in Programming, not Electrical.
export const DEPARTMENTS: DepartmentDef[] = [
  { key: "programming", label: "Programming / Coding", bar: "bg-rose-500", dot: "bg-rose-500" },
  { key: "paint", label: "Paint", bar: "bg-violet-500", dot: "bg-violet-500" },
  { key: "dent", label: "Dent / Bodywork", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "electrical", label: "Electrical", bar: "bg-sky-500", dot: "bg-sky-500" },
  { key: "mechanical", label: "Mechanical", bar: "bg-emerald-500", dot: "bg-emerald-500" },
]

export const DEPARTMENT_LABEL: Record<DepartmentKey, string> = DEPARTMENTS.reduce(
  (acc, d) => {
    acc[d.key] = d.label
    return acc
  },
  {} as Record<DepartmentKey, string>,
)

// Keyword rules per department, tested in this order (specific → general).
const RULES: { key: DepartmentKey; patterns: RegExp }[] = [
  {
    key: "programming",
    patterns:
      /\b(program|programm|coding|code|flash|ecu|tcu|module|immobil|key\s*prog|software|retrofit|adaptation|adapt|calibrat|configur|firmware|remap|dme|dde|vin\s*writ)\b/,
  },
  {
    key: "paint",
    patterns: /\b(paint|spray|refinish|clear\s*coat|clearcoat|primer|polish|buff|lacquer|respray|colour\s*match|color\s*match)\b/,
  },
  {
    key: "dent",
    patterns:
      /\b(dent|body\s*work|bodywork|body\s*&?\s*paint|panel|bumper|fender|wing|collision|straighten|weld|chassis\s*align|pdr|filler|fabricat|accident|crash|realign)\b/,
  },
  {
    key: "electrical",
    patterns:
      /\b(electric|electrical|a\/?c|air\s*condition|wiring|harness|battery|alternator|starter|sensor|light|lamp|electronic|diagnos|scan|fuse|relay|window|central\s*lock|audio|infotain|camera|radar|park\s*assist)\b/,
  },
]

/**
 * Classify a labour line into a department using its category first, then its
 * name/detail as a fallback. Anything unmatched is treated as Mechanical, the
 * workshop's default labour bucket.
 */
export function classifyLabour(
  category?: string | null,
  name?: string | null,
  detail?: string | null,
): DepartmentKey {
  const haystack = `${category ?? ""} ${name ?? ""} ${detail ?? ""}`.toLowerCase()
  for (const rule of RULES) {
    if (rule.patterns.test(haystack)) return rule.key
  }
  return "mechanical"
}

export type DepartmentTotal = {
  key: DepartmentKey
  label: string
  hours: number
  amount: number
  lineCount: number
  jobCount: number
}

export type LabourReportRow = {
  jobNumber: string
  date: string
  department: DepartmentKey
  description: string
  category: string
  hours: number
  rate: number
  amount: number
}
