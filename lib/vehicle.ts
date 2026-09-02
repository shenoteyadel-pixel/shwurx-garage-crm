// Vehicle brand logo + body-type silhouette resolution.
// Brand logos are served from theSVG (jsDelivr CDN). Body-type silhouettes are
// local generated images used when a job has no uploaded cover photo.

const LOGO_BASE = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons"

// Normalized make (lowercase, no spaces/punctuation) -> theSVG slug.
// Makes not listed here fall back to an initials badge.
const BRAND_SLUGS: Record<string, string> = {
  mercedes: "mercedes-benz",
  mercedesbenz: "mercedes-benz",
  benz: "mercedes-benz",
  bmw: "bmw",
  porsche: "porsche",
  audi: "audi",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  ferrari: "ferrari",
  lamborghini: "lamborghini",
  bentley: "bentley",
  rollsroyce: "rolls-royce",
  maserati: "maserati",
  toyota: "toyota",
  lexus: "lexus",
  nissan: "nissan",
  honda: "honda",
  ford: "ford",
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  hyundai: "hyundai",
  kia: "kia",
  mazda: "mazda",
  jaguar: "jaguar",
  volvo: "volvo",
  tesla: "tesla",
  jeep: "jeep",
  cadillac: "cadillac",
  subaru: "subaru",
  mitsubishi: "mitsubishi",
  peugeot: "peugeot",
  renault: "renault",
  fiat: "fiat",
  astonmartin: "aston-martin",
  mclaren: "mclaren",
  bugatti: "bugatti",
  mini: "mini",
  infiniti: "infiniti",
  acura: "acura",
  chrysler: "chrysler",
  suzuki: "suzuki",
  skoda: "skoda",
  seat: "seat",
  opel: "opel",
  mg: "mg",
  citroen: "citroen",
}

export type BodyType =
  | "sedan"
  | "suv"
  | "coupe"
  | "convertible"
  | "hatchback"
  | "pickup"
  | "van"
  | "sports"

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "coupe", label: "Coupe" },
  { value: "convertible", label: "Convertible" },
  { value: "hatchback", label: "Hatchback" },
  { value: "pickup", label: "Pickup" },
  { value: "van", label: "Van" },
  { value: "sports", label: "Sports Car" },
]

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Optional model suggestions per make for the intake combobox (free text still allowed).
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  Toyota: ["Land Cruiser", "Prado", "Camry", "Corolla", "Hilux", "RAV4", "Fortuner", "Yaris", "Supra"],
  Nissan: ["Patrol", "Altima", "Sunny", "X-Trail", "Kicks", "Maxima", "Navara", "GT-R"],
  "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "G-Class", "GLE", "GLC", "GLS", "A-Class", "AMG GT"],
  BMW: ["3 Series", "5 Series", "7 Series", "X3", "X5", "X6", "X7", "M4", "i7"],
  Audi: ["A4", "A6", "A8", "Q5", "Q7", "Q8", "RS7", "e-tron"],
  Lexus: ["LX", "GX", "RX", "NX", "ES", "LS", "IS", "LC"],
  "Land Rover": ["Range Rover", "Range Rover Sport", "Defender", "Discovery", "Evoque", "Velar"],
  Porsche: ["911", "Cayenne", "Macan", "Panamera", "Taycan", "718 Cayman"],
  Ford: ["F-150", "Mustang", "Explorer", "Expedition", "Ranger", "Edge"],
  Chevrolet: ["Tahoe", "Suburban", "Silverado", "Camaro", "Corvette", "Malibu"],
  GMC: ["Yukon", "Sierra", "Acadia", "Terrain"],
  Honda: ["Accord", "Civic", "CR-V", "Pilot", "Odyssey"],
  Hyundai: ["Sonata", "Elantra", "Tucson", "Santa Fe", "Palisade"],
  Kia: ["Sportage", "Sorento", "Seltos", "Carnival", "Telluride"],
  Ferrari: ["488", "F8", "Roma", "SF90", "812", "Purosangue"],
  Lamborghini: ["Urus", "Huracan", "Aventador", "Revuelto"],
  "Rolls-Royce": ["Cullinan", "Ghost", "Phantom", "Wraith", "Spectre"],
  Bentley: ["Bentayga", "Continental GT", "Flying Spur"],
}

export function brandLogoUrl(make: string | null | undefined): string | null {
  const slug = BRAND_SLUGS[normalize(make)]
  return slug ? `${LOGO_BASE}/${slug}/default.svg` : null
}

export function brandInitials(make: string | null | undefined): string {
  const m = (make || "").trim()
  if (!m) return "?"
  const parts = m.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return m.slice(0, 2).toUpperCase()
}

// Model keyword -> body type. Checked before the generic make heuristic.
const MODEL_BODY_HINTS: [RegExp, BodyType][] = [
  [/\b(911|488|458|570|720|f8|huracan|aventador|gt3|gt2|supra|gr86|corvette|z4|amg gt)\b/, "sports"],
  [/(cayenne|macan|urus|bentayga|cullinan|g[\s-]?class|g\d{2,3}|land ?cruiser|prado|patrol|range rover|rangerover|x[3-7]\b|q[3-8]\b|gl[aces]|glc|gle|gls|rx|nx|lx|gx|rav4|highlander|tahoe|suburban|explorer|pathfinder|xterra|4runner|touareg|tiguan|santa fe|tucson|sorento|sportage|cx-?\d|discovery|defender|wrangler|grand cherokee|escalade|navigator)/, "suv"],
  [/(hilux|ranger|f-?150|f-?250|silverado|sierra|tundra|tacoma|navara|d-?max|amarok|gladiator|colorado|frontier)/, "pickup"],
  [/(hiace|transit|sprinter|caravan|sienna|odyssey|carnival|vito|viano|transporter|caddy)/, "van"],
  [/(golf|polo|yaris|corolla hatch|swift|fit|jazz|i20|i10|micra|fiesta|clio|328i gt)/, "hatchback"],
  [/(spider|spyder|cabrio|convertible|roadster|z4|slk|slc|boxster|124 spider|miata|mx-?5)/, "convertible"],
  [/(coupe|c-?class coupe|4 series|2 series|mustang|challenger|camaro|rc\b|gt\b)/, "coupe"],
]

const SPORTS_MAKES = new Set(["ferrari", "lamborghini", "mclaren", "bugatti", "porsche"])
const LUXURY_SUV_HEAVY = new Set(["landrover", "rangerover", "jeep"])

export function inferBodyType(
  make: string | null | undefined,
  model: string | null | undefined,
): BodyType {
  const m = `${(make || "").toLowerCase()} ${(model || "").toLowerCase()}`.trim()
  for (const [re, type] of MODEL_BODY_HINTS) {
    if (re.test(m)) return type
  }
  const nmake = normalize(make)
  if (SPORTS_MAKES.has(nmake) && model) return "sports"
  if (LUXURY_SUV_HEAVY.has(nmake)) return "suv"
  return "sedan"
}

export function silhouetteUrl(bodyType: BodyType): string {
  return `/silhouettes/${bodyType}.png`
}

/* ---------------- Vehicle profile (model-accurate silhouette) ---------------- */
// A profile is a finer-grained silhouette class than body type. The renderer
// draws a distinct shape per profile, so a C-Class reads as a compact sedan,
// a G63 as a boxy SUV, and a 911 as a low sports coupe.
export type VehicleProfile =
  | "sedan"
  | "sedan_luxury"
  | "coupe"
  | "sports"
  | "hatchback"
  | "wagon"
  | "suv"
  | "suv_large"
  | "suv_boxy"
  | "pickup"
  | "van"
  | "convertible"

// Normalize free text to a spaced, lowercase, alphanumeric string ("C-Class" -> "c class").
function normText(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
// Compact form with spaces/punctuation removed ("c 200" -> "c200", "C-Class" -> "cclass").
function compact(s: string | null | undefined): string {
  return normText(s).replace(/\s+/g, "")
}

type ModelRule = { canonical: string; profile: VehicleProfile; test: RegExp }
type MakeDef = {
  canonical: string // proper make name used for image lookups, e.g. "Mercedes-Benz"
  aliases: string[] // compact alias keys, incl. common misspellings
  defaultProfile: VehicleProfile // brand-family fallback when no model matches
  models: ModelRule[] // tested in order against the compact model string
}

// Structured make + model database. Model rules are tested top-to-bottom, so the
// most specific entries come first (e.g. CLA/CLS before C/S-Class).
const VEHICLE_DB: MakeDef[] = [
  {
    canonical: "Mercedes-Benz",
    aliases: ["mercedes", "mercedesbenz", "merc", "benz", "mercdes", "mercedez", "mercades", "mb"],
    defaultProfile: "sedan",
    models: [
      { canonical: "CLA", profile: "sedan", test: /^cla/ },
      { canonical: "CLS", profile: "sedan_luxury", test: /^cls/ },
      { canonical: "GLE", profile: "suv", test: /^gle/ },
      { canonical: "GLS", profile: "suv_large", test: /^gls/ },
      { canonical: "GLC", profile: "suv", test: /^glc/ },
      { canonical: "GLA", profile: "suv", test: /^gla/ },
      { canonical: "GLB", profile: "suv", test: /^glb/ },
      { canonical: "GLK", profile: "suv", test: /^glk/ },
      { canonical: "G-Class", profile: "suv_boxy", test: /^g(class|wagon|wagen|\d{2,3})/ },
      { canonical: "SL", profile: "convertible", test: /^sl(k|c|\d|$)/ },
      { canonical: "S-Class", profile: "sedan_luxury", test: /^(maybach|s(class|\d{3}))/ },
      { canonical: "E-Class", profile: "sedan", test: /^e(class|\d{3})/ },
      { canonical: "C-Class", profile: "sedan", test: /^c(class|\d{2,3})/ },
      { canonical: "A-Class", profile: "hatchback", test: /^a(class|\d{3})/ },
      { canonical: "V-Class", profile: "van", test: /^(vclass|vito|viano)/ },
    ],
  },
  {
    canonical: "BMW",
    aliases: ["bmw"],
    defaultProfile: "sedan",
    models: [
      { canonical: "X7", profile: "suv_large", test: /^x7/ },
      { canonical: "X6", profile: "suv", test: /^x6/ },
      { canonical: "X5", profile: "suv", test: /^x5/ },
      { canonical: "X4", profile: "suv", test: /^x4/ },
      { canonical: "X3", profile: "suv", test: /^x3/ },
      { canonical: "X1", profile: "suv", test: /^x[12]/ },
      { canonical: "Z4", profile: "convertible", test: /^z4/ },
      { canonical: "i7", profile: "sedan_luxury", test: /^i7/ },
      { canonical: "7 Series", profile: "sedan_luxury", test: /^7(series|\d{2})/ },
      { canonical: "8 Series", profile: "coupe", test: /^8(series|\d{2})/ },
      { canonical: "5 Series", profile: "sedan", test: /^5(series|\d{2})/ },
      { canonical: "4 Series", profile: "coupe", test: /^4(series|\d{2})/ },
      { canonical: "3 Series", profile: "sedan", test: /^3(series|\d{2})/ },
      { canonical: "2 Series", profile: "coupe", test: /^2(series|\d{2})/ },
      { canonical: "1 Series", profile: "hatchback", test: /^1(series|\d{2})/ },
      { canonical: "M3", profile: "sedan", test: /^m[35]/ },
      { canonical: "M4", profile: "coupe", test: /^m[248]/ },
    ],
  },
  {
    canonical: "Audi",
    aliases: ["audi", "audy"],
    defaultProfile: "sedan",
    models: [
      { canonical: "RS6", profile: "wagon", test: /^(rs6|.*avant)/ },
      { canonical: "Q8", profile: "suv_large", test: /^q8/ },
      { canonical: "Q7", profile: "suv_large", test: /^q7/ },
      { canonical: "Q5", profile: "suv", test: /^q5/ },
      { canonical: "Q3", profile: "suv", test: /^q[34]/ },
      { canonical: "e-tron", profile: "suv", test: /^etron/ },
      { canonical: "TT", profile: "coupe", test: /^tt/ },
      { canonical: "R8", profile: "sports", test: /^r8/ },
      { canonical: "A8", profile: "sedan_luxury", test: /^(a8|s8)/ },
      { canonical: "A7", profile: "sedan_luxury", test: /^(a7|s7|rs7)/ },
      { canonical: "A6", profile: "sedan", test: /^(a6|s6)/ },
      { canonical: "A5", profile: "coupe", test: /^(a5|s5|rs5)/ },
      { canonical: "A4", profile: "sedan", test: /^(a4|s4)/ },
      { canonical: "A3", profile: "sedan", test: /^(a3|s3|rs3)/ },
    ],
  },
  {
    canonical: "Porsche",
    aliases: ["porsche", "porche", "porsch"],
    defaultProfile: "sports",
    models: [
      { canonical: "Cayenne", profile: "suv", test: /^cayenne/ },
      { canonical: "Macan", profile: "suv", test: /^macan/ },
      { canonical: "Panamera", profile: "sedan_luxury", test: /^panamera/ },
      { canonical: "Taycan", profile: "sedan_luxury", test: /^taycan/ },
      { canonical: "718 Cayman", profile: "sports", test: /^(718|cayman|boxster)/ },
      { canonical: "911", profile: "sports", test: /^(911|carrera|gt[23]|turbo)/ },
    ],
  },
  {
    canonical: "Land Rover",
    aliases: ["landrover", "rangerover", "range", "rover", "land", "rangie"],
    defaultProfile: "suv_large",
    models: [
      { canonical: "Range Rover Evoque", profile: "suv", test: /^evoque/ },
      { canonical: "Range Rover Velar", profile: "suv", test: /^velar/ },
      { canonical: "Range Rover Sport", profile: "suv_large", test: /^sport/ },
      { canonical: "Range Rover", profile: "suv_large", test: /^(vogue|autobiography|svr|rangerover|range)/ },
      { canonical: "Defender", profile: "suv_boxy", test: /^defender/ },
      { canonical: "Discovery", profile: "suv", test: /^disco/ },
    ],
  },
  {
    canonical: "Toyota",
    aliases: ["toyota", "toyta", "toyoto", "toyata"],
    defaultProfile: "sedan",
    models: [
      { canonical: "Land Cruiser", profile: "suv_boxy", test: /^(landcruiser|lc\d{2,3}|landcruser)/ },
      { canonical: "Prado", profile: "suv", test: /^prado/ },
      { canonical: "Fortuner", profile: "suv", test: /^fortuner/ },
      { canonical: "RAV4", profile: "suv", test: /^rav4/ },
      { canonical: "Hilux", profile: "pickup", test: /^hilux/ },
      { canonical: "Hiace", profile: "van", test: /^hiace/ },
      { canonical: "Supra", profile: "sports", test: /^supra/ },
      { canonical: "Yaris", profile: "hatchback", test: /^yaris/ },
      { canonical: "Corolla", profile: "sedan", test: /^corolla/ },
      { canonical: "Camry", profile: "sedan", test: /^camry/ },
    ],
  },
  {
    canonical: "Nissan",
    aliases: ["nissan", "nisan", "nissian"],
    defaultProfile: "sedan",
    models: [
      { canonical: "Patrol", profile: "suv_boxy", test: /^patrol/ },
      { canonical: "X-Trail", profile: "suv", test: /^xtrail/ },
      { canonical: "Pathfinder", profile: "suv", test: /^pathfinder/ },
      { canonical: "Kicks", profile: "suv", test: /^kicks/ },
      { canonical: "Navara", profile: "pickup", test: /^navara/ },
      { canonical: "GT-R", profile: "sports", test: /^gtr/ },
      { canonical: "Altima", profile: "sedan", test: /^altima/ },
      { canonical: "Maxima", profile: "sedan", test: /^maxima/ },
      { canonical: "Sunny", profile: "sedan", test: /^sunny/ },
    ],
  },
]

// Generic keyword rules for makes not in the structured DB (final safety net).
const GENERIC_RULES: [RegExp, VehicleProfile][] = [
  [/(ferrari|lamborghini|mclaren|bugatti|911|cayman|boxster|718|corvette|huracan|aventador|f8|488|458|720s|roma|sf90|812|r8|gtr)/, "sports"],
  [/(g-?class|g ?wagon|defender|wrangler|jimny|land ?cruiser|patrol|\blx\b|\bgx\b)/, "suv_boxy"],
  [/(range ?rover|escalade|navigator|suburban|expedition|bentayga|cullinan|urus|armada|sequoia|x7|q8|gls|qx80)/, "suv_large"],
  [/(cayenne|macan|rav4|highlander|cr-?v|tucson|santa ?fe|sorento|sportage|tiguan|touareg|cx-?\d|discovery|evoque|velar|explorer|pathfinder|x-?trail|4runner|prado|kona|outlander|xc\d0|suv|q[3-7]|x[1-6]|gl[abce])/, "suv"],
  [/(hilux|ranger|f-?150|f-?250|silverado|sierra|tundra|tacoma|navara|d-?max|amarok|gladiator|colorado|frontier|ram|pickup|truck)/, "pickup"],
  [/(hiace|transit|sprinter|caravan|sienna|odyssey|carnival|vito|viano|transporter|caddy|starex|urvan|van)/, "van"],
  [/(spider|spyder|cabrio|cabriolet|convertible|roadster|miata|mx-?5)/, "convertible"],
  [/(avant|estate|wagon|touring|variant|allroad)/, "wagon"],
  [/(coupe|mustang|challenger|camaro|brz|gr86|\b86\b)/, "coupe"],
  [/(maybach|panamera|taycan|flying ?spur|ghost|phantom)/, "sedan_luxury"],
  [/(golf|polo|yaris|swift|fit|jazz|micra|fiesta|clio|picanto|rio|hatch)/, "hatchback"],
]

const PROFILE_FROM_BODY: Record<BodyType, VehicleProfile> = {
  sedan: "sedan",
  suv: "suv",
  coupe: "coupe",
  convertible: "convertible",
  hatchback: "hatchback",
  pickup: "pickup",
  van: "van",
  sports: "sports",
}

function findMakeDef(make: string | null | undefined): MakeDef | undefined {
  const key = compact(make)
  if (!key) return undefined
  // Exact alias match first, then a contains match for compound inputs.
  return (
    VEHICLE_DB.find((m) => m.aliases.includes(key) || compact(m.canonical) === key) ||
    VEHICLE_DB.find((m) => m.aliases.some((a) => key.includes(a)))
  )
}

export type ResolvedVehicle = {
  make: string // canonical make (or cleaned original if unknown)
  model: string // canonical model family (or cleaned original if unknown)
  profile: VehicleProfile
  matched: boolean // true when a known make (and ideally model) was recognized
}

// Core resolver. Priority:
//   1. Exact/family model match within a known make
//   2. Brand-family default when the make is known but the model is not
//   3. Generic keyword rules across all makes
//   4. Stored body type, then the body-type heuristic
export function resolveVehicle(
  make: string | null | undefined,
  model: string | null | undefined,
  bodyType?: string | null,
): ResolvedVehicle {
  const def = findMakeDef(make)
  const modelCompact = compact(model)
  const titleModel = titleCase(normText(model))

  if (def) {
    for (const rule of def.models) {
      if (modelCompact && rule.test.test(modelCompact)) {
        return { make: def.canonical, model: rule.canonical, profile: rule.profile, matched: true }
      }
    }
    // Known make, unknown model -> brand-family fallback, keep the typed model.
    return {
      make: def.canonical,
      model: titleModel || def.canonical,
      profile: def.defaultProfile,
      matched: true,
    }
  }

  // Unknown make: generic keyword pass over "make model".
  const hay = `${normText(make)} ${normText(model)}`.trim()
  for (const [re, profile] of GENERIC_RULES) {
    if (hay && re.test(hay)) {
      return { make: titleCase(normText(make)), model: titleModel, profile, matched: false }
    }
  }

  // Body-type fallbacks.
  const bt = bodyType as BodyType | null | undefined
  const profile =
    bt && BODY_TYPES.some((b) => b.value === bt) ? PROFILE_FROM_BODY[bt] : PROFILE_FROM_BODY[inferBodyType(make, model)]
  return { make: titleCase(normText(make)), model: titleModel, profile, matched: false }
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Thin wrapper kept for existing callers that only need the silhouette profile.
export function resolveVehicleProfile(
  make: string | null | undefined,
  model: string | null | undefined,
  bodyType?: string | null,
): VehicleProfile {
  return resolveVehicle(make, model, bodyType).profile
}

// Canonical make/model for image lookups (CarsXE). Falls back to cleaned input.
export function canonicalizeVehicle(
  make: string | null | undefined,
  model: string | null | undefined,
): { make: string; model: string } {
  const r = resolveVehicle(make, model)
  return { make: r.make || (make || "").trim(), model: r.model || (model || "").trim() }
}

/* ---------------- Paint color resolution ---------------- */
// Maps a free-text color from the job card to a realistic paint hex.
// Keyword substring match (normalized), then raw hex, then neutral fallback.
const COLOR_KEYWORDS: [string, string][] = [
  ["pearlwhite", "#eef1f4"],
  ["pearl", "#e9edf2"],
  ["obsidian", "#17181c"],
  ["gunmetal", "#4b5058"],
  ["graphite", "#3b3f45"],
  ["charcoal", "#31353b"],
  ["white", "#f1f3f5"],
  ["black", "#191b1f"],
  ["silver", "#cbd0d6"],
  ["grey", "#9198a1"],
  ["gray", "#9198a1"],
  ["navy", "#1e3356"],
  ["skyblue", "#5aa9e6"],
  ["blue", "#2f6fe0"],
  ["crimson", "#c62236"],
  ["red", "#d62f2f"],
  ["maroon", "#7c1f2b"],
  ["burgundy", "#6d1f2e"],
  ["green", "#1f9d55"],
  ["brown", "#6f4522"],
  ["bronze", "#8a6a3b"],
  ["beige", "#d9c9a6"],
  ["champagne", "#d8c9a3"],
  ["gold", "#c8a53a"],
  ["orange", "#e8681f"],
  ["yellow", "#e8c018"],
  ["purple", "#7b46d1"],
  ["violet", "#7b46d1"],
  ["pink", "#dd6aa0"],
  ["teal", "#1f9a99"],
]

const HEX_RE = /^#?[0-9a-f]{6}$|^#?[0-9a-f]{3}$/i

export function resolvePaint(color: string | null | undefined): { paint: string; isLight: boolean } {
  const raw = (color || "").trim()
  let paint = "#8b9199" // neutral default when no color is provided
  if (raw) {
    const n = normalize(raw)
    const hit = COLOR_KEYWORDS.find(([k]) => n.includes(k))
    if (hit) {
      paint = hit[1]
    } else if (HEX_RE.test(raw)) {
      paint = raw.startsWith("#") ? raw : `#${raw}`
    }
  }
  return { paint, isLight: luminance(paint) > 0.6 }
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const num = Number.parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Mix a hex color toward black (amount<0) or white (amount>0), amount in -1..1.
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const t = amount < 0 ? 0 : 255
  const p = Math.abs(amount)
  const mix = (c: number) => Math.round((t - c) * p + c)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`
}

// Resolve the best silhouette for a job from stored body_type or make/model.
export function resolveSilhouette(
  bodyType: string | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const bt = (bodyType as BodyType) || inferBodyType(make, model)
  const valid = BODY_TYPES.some((b) => b.value === bt) ? bt : inferBodyType(make, model)
  return silhouetteUrl(valid)
}
