// Labour-hours reporting: classify free-text labour categories into the five
// workshop departments the garage tracks, and shape the aggregation results.

export type DepartmentKey = "mechanical" | "electrical" | "ac" | "paint" | "dent" | "programming" | "service"

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
  { key: "ac", label: "A/C & Climate", bar: "bg-cyan-500", dot: "bg-cyan-500" },
  { key: "electrical", label: "Electrical", bar: "bg-sky-500", dot: "bg-sky-500" },
  { key: "service", label: "Service / Valet", bar: "bg-teal-500", dot: "bg-teal-500" },
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
// Stems use a leading \b but no trailing \b so they match inflected forms
// ("program" -> "programming"/"programing", "diagnos" -> "diagnostics").
// Genuinely short/ambiguous tokens (a/c) stay whole-word to avoid false hits
// like "acceleration".
const RULES: { key: DepartmentKey; patterns: RegExp }[] = [
  {
    key: "service",
    patterns: /\b(wash|valet|detailing|steam\s*clean|shampoo|pick\s*-?up|pickup|deliver|drop\s*-?off|collection|transport|courtesy)/,
  },
  {
    key: "programming",
    patterns:
      /\b(program|coding|flash|ecu|tcu|module|immobil|key\s*prog|software|retrofit|adaptation|adapt|calibrat|configur|firmware|remap|dme|dde|vin\s*writ)/,
  },
  {
    key: "paint",
    patterns: /\b(paint|spray|refinish|clear\s*coat|clearcoat|primer|polish|buff|lacquer|respray|colou?r\s*match)/,
  },
  {
    key: "dent",
    patterns:
      /\b(dent|body\s*work|bodywork|panel|bumper|fender|collision|straighten|weld|pdr|filler|fabricat|accident|crash|realign)/,
  },
  {
    // A/C & climate is its own department (previously folded into Electrical) so
    // air-conditioning work is visible on its own line.
    key: "ac",
    patterns: /(\ba\/c\b|\bac\b|\bair\s*condition|\bclimate\s*control|\bhvac|\bre-?gas|\brefriger|\bcompressor|\bevaporator|\bcondenser|\bfreon)/,
  },
  {
    key: "electrical",
    patterns:
      /(\belectric|\bwiring|\bharness|\bbattery|\balternator|\bstarter|\bsensor|\blight|\blamp|\belectronic|\bdiagnos|\bscan|\bfuse|\brelay|\bwindow|\bcentral\s*lock|\baudio|\binfotain|\bcamera|\bradar|\bpark\s*assist)/,
  },
]

/**
 * Classify a labour line into a department. The item NAME/DETAIL is tested
 * first because it describes the actual work ("dent", "paint", "programming"),
 * and only if that is inconclusive do we fall back to the broader category
 * (e.g. a generic "Body & Paint" category whose word "paint" would otherwise
 * mis-bucket a dent line). Anything still unmatched defaults to Mechanical.
 */
export function classifyLabour(
  category?: string | null,
  name?: string | null,
  detail?: string | null,
  addonType?: string | null,
): DepartmentKey {
  // Add-on service lines (wash / pickup / delivery) carry an explicit type, so
  // bucket them deterministically instead of guessing from free text.
  if (addonType) return "service"
  const nameHay = `${name ?? ""} ${detail ?? ""}`.toLowerCase().trim()
  for (const rule of RULES) {
    if (nameHay && rule.patterns.test(nameHay)) return rule.key
  }
  const categoryHay = (category ?? "").toLowerCase().trim()
  for (const rule of RULES) {
    if (categoryHay && rule.patterns.test(categoryHay)) return rule.key
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
