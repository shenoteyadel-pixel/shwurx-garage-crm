/**
 * Canonical vehicle body types used by the inspection damage-map schematics.
 *
 * The diagram is brand-neutral line-art whose silhouette changes by body type,
 * so every vehicle — regardless of make/model — gets an accurate outline.
 * When a job/vehicle has no recognized body type we fall back to "sedan"
 * (a neutral shape) and let staff pick the correct one; we never guess from
 * the make/model.
 */

export const BODY_TYPES = [
  "sedan",
  "suv",
  "coupe",
  "hatchback",
  "wagon",
  "pickup",
  "van",
  "sports",
  "convertible",
] as const

export type BodyType = (typeof BODY_TYPES)[number]

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  sedan: "Sedan",
  suv: "SUV / 4x4",
  coupe: "Coupe",
  hatchback: "Hatchback",
  wagon: "Wagon / Estate",
  pickup: "Pickup Truck",
  van: "Van / MPV",
  sports: "Sports Car",
  convertible: "Convertible",
}

export const DEFAULT_BODY_TYPE: BodyType = "sedan"

/** Map common synonyms/spellings onto a canonical body type. */
const ALIASES: Record<string, BodyType> = {
  sedan: "sedan",
  saloon: "sedan",
  "4door": "sedan",
  suv: "suv",
  crossover: "suv",
  cuv: "suv",
  "4x4": "suv",
  "4wd": "suv",
  offroad: "suv",
  "off-road": "suv",
  jeep: "suv",
  coupe: "coupe",
  "2door": "coupe",
  hatchback: "hatchback",
  hatch: "hatchback",
  wagon: "wagon",
  estate: "wagon",
  touring: "wagon",
  avant: "wagon",
  pickup: "pickup",
  "pick-up": "pickup",
  truck: "pickup",
  ute: "pickup",
  van: "van",
  minivan: "van",
  mpv: "van",
  bus: "van",
  panel: "van",
  sports: "sports",
  sport: "sports",
  supercar: "sports",
  roadster: "convertible",
  convertible: "convertible",
  cabriolet: "convertible",
  cabrio: "convertible",
  spider: "convertible",
  spyder: "convertible",
}

/**
 * Normalize a raw body-type string (from the job/vehicle record) to a canonical
 * BodyType. Returns null when the value is missing or unrecognized so callers
 * can distinguish "known" from "defaulted".
 */
export function normalizeBodyType(raw: string | null | undefined): BodyType | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase().replace(/\s+/g, "")
  if (!key) return null
  if ((BODY_TYPES as readonly string[]).includes(key)) return key as BodyType
  if (ALIASES[key]) return ALIASES[key]
  // Substring pass for values like "large suv" or "sport utility".
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (key.includes(alias)) return canonical
  }
  if (key.includes("utility")) return "suv"
  return null
}

/** Resolve to a concrete BodyType for rendering, defaulting to a neutral shape. */
export function resolveBodyType(raw: string | null | undefined): BodyType {
  return normalizeBodyType(raw) ?? DEFAULT_BODY_TYPE
}
