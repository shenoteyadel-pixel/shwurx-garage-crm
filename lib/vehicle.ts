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
