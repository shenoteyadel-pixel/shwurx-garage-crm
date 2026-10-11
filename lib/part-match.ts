/**
 * Workshop-aware part name matching. Advisors, technicians and suppliers name
 * the same part differently ("Front lower arm (copy)" vs "FRONT LOWER ARM RH
 * ESCAPE 2013-2017"), so exact text comparison lets the same part land on a job
 * card twice. This normalises abbreviations, typos, positions and noise words,
 * then compares what is left.
 */

type Axle = "front" | "rear" | null
type Side = "left" | "right" | null

export type PartSignature = {
  core: string[]
  axle: Axle
  side: Side
  service: boolean
}

const SYNONYMS: Record<string, string> = {
  fr: "front", frt: "front", fnt: "front", fwd: "front",
  rr: "rear", rer: "rear", back: "rear",
  lh: "left", lhs: "left", l: "left",
  rh: "right", rhs: "right", r: "right",
  stabiliser: "stabilizer", stablizer: "stabilizer", stabilzer: "stabilizer", stab: "stabilizer", sway: "stabilizer", anti: "stabilizer",
  absorber: "shock", absorbers: "shock", shocks: "shock", strut: "shock", struts: "shock", damper: "shock",
  abel: "axle", axel: "axle", cv: "axle", driveshaft: "axle",
  pads: "pad", plugs: "plug", discs: "disc", disk: "disc", rotor: "disc", rotors: "disc",
  ac: "cabin", aircon: "cabin", pollen: "cabin",
  beairng: "bearing", bearings: "bearing", bush: "bushing", bushes: "bushing",
  wiper: "wiper", wipers: "wiper", blade: "wiper",
  break: "brake", brakes: "brake",
  tyre: "tire", tyres: "tire", tires: "tire",
  filters: "filter", hoses: "hose", links: "link", arms: "arm", boots: "boot", mounts: "mount", belts: "belt",
  sheld: "shield", finder: "fender",
}

const NOISE = new Set([
  "copy", "original", "orig", "org", "genuine", "oem", "aftermarket", "afm", "aft", "after", "market", "brand", "new",
  "assy", "assembly", "kit", "set", "sp", "pc", "pcs", "piece", "pair", "part", "parts", "supply", "complete", "comp",
  "unit", "type", "the", "and", "with", "for", "of", "no", "nos", "qty", "up", "to", "model", "only", "x", "spare",
  "item", "ea", "each", "both", "lr", "side", "inner", "outer", "upper",
])

/** Words that describe work, not a physical part: never merge work with a part. */
const SERVICE = new Set([
  "opening", "fitting", "fixing", "making", "repair", "service", "labour", "labor", "alignment", "balancing",
  "installation", "install", "removal", "remove", "replace", "replacement", "diagnosis", "check", "wash", "charge",
])

/** Words too generic to identify a part on their own. */
const GENERIC = new Set(["filter", "hose", "oil", "sensor", "bracket", "cover", "bolt", "nut", "clip", "pipe", "light", "lamp", "belt", "mount"])

export function partSignature(raw: unknown): PartSignature {
  const text = String(raw ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/\b(l\s*\/\s*r|lh\s*\/\s*rh|rh\s*\/\s*lh|left\s*\/\s*right|r\s*\/\s*l)\b/g, " lr ")
    .replace(/\ba\s*\/\s*c\b/g, " ac ")
    .replace(/[^a-z0-9]+/g, " ")

  let axle: Axle = null
  let side: Side = null
  let service = false
  const core: string[] = []
  for (const tok of text.split(" ")) {
    if (!tok || /\d/.test(tok)) continue
    const word = SYNONYMS[tok] ?? tok
    if (word === "front" || word === "rear") {
      axle = axle && axle !== word ? null : word
      continue
    }
    if (word === "left" || word === "right") {
      side = side && side !== word ? null : word
      continue
    }
    if (SERVICE.has(word)) {
      service = true
      continue
    }
    if (NOISE.has(word) || word.length < 2) continue
    const singular = word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
    if (!core.includes(singular)) core.push(singular)
  }
  return { core, axle, side, service }
}

/**
 * 0..1 similarity between two part names. Conflicting positions (front vs
 * rear, left vs right) or a part vs a labour line never match.
 */
export function partMatchScore(a: unknown, b: unknown): number {
  const x = typeof a === "object" && a && "core" in (a as object) ? (a as PartSignature) : partSignature(a)
  const y = typeof b === "object" && b && "core" in (b as object) ? (b as PartSignature) : partSignature(b)
  if (!x.core.length || !y.core.length) return 0
  if (x.axle && y.axle && x.axle !== y.axle) return 0
  if (x.side && y.side && x.side !== y.side) return 0
  if (x.service !== y.service) return 0

  const ys = new Set(y.core)
  const shared = x.core.filter((t) => ys.has(t)).length
  if (shared === 0) return 0
  const small = Math.min(x.core.length, y.core.length)
  const large = Math.max(x.core.length, y.core.length)
  // A single generic word ("filter", "hose") is not enough to call two parts the same.
  if (small === 1 && large > 1) {
    const only = x.core.length === 1 ? x.core[0] : y.core[0]
    if (GENERIC.has(only)) return 0
  }
  // Extra part nouns on the longer name make it a different part:
  // "coolant" vs "coolant hose", "fog light" vs "fog light bracket".
  const xs = new Set(x.core)
  const extras = [...x.core.filter((t) => !ys.has(t)), ...y.core.filter((t) => !xs.has(t))]
  if (extras.some((t) => GENERIC.has(t))) return 0
  const containment = shared / small
  const dice = (2 * shared) / (x.core.length + y.core.length)
  if (containment === 1 && dice >= 0.5) return 0.75 + dice / 4
  return dice >= 0.8 ? dice * 0.9 : 0
}

export const PART_MATCH_THRESHOLD = 0.75

export const isSamePart = (a: unknown, b: unknown) => partMatchScore(a, b) >= PART_MATCH_THRESHOLD

/** Which supplier document a job-card line came from, read from its detail text. */
export function partDocLink(detail: unknown): "bill" | "quote" | null {
  const d = String(detail ?? "")
  if (/supplier invoice|\bbill\b|manual purchase/i.test(d)) return "bill"
  if (/\bquote\b/i.test(d)) return "quote"
  return null
}

/** Best line among `candidates` for `name`, or null when nothing is close enough. */
export function bestPartMatch<T>(name: string, candidates: T[], nameOf: (c: T) => unknown): T | null {
  const sig = partSignature(name)
  let best: T | null = null
  let bestScore = 0
  for (const c of candidates) {
    const s = partMatchScore(sig, nameOf(c))
    if (s >= PART_MATCH_THRESHOLD && s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}
