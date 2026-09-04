import "server-only"
import { canonicalizeVehicle } from "@/lib/vehicle"

/**
 * CarsXE Vehicle Images resolver.
 *
 * Fetches a REAL representative image for a make/model/year(/variant/color)
 * from the CarsXE Images API. The goal is model accuracy first, colour second:
 * a correct C-Class in the wrong colour beats a generic black sedan.
 *
 * Selection is score-based rather than a strict host allowlist — CarsXE returns
 * photos from dealer, press and stock hosts and almost all are usable. We reject
 * only junk (thumbnails, logos, tiny images) and rank the rest, preferring clean
 * studio renders. Only when every tier truly returns nothing do we return null
 * so the caller can fall back to the SVG silhouette (never saved permanently).
 *
 * Docs: https://api.carsxe.com/docs/images  ->  GET https://api.carsxe.com/images
 */

export interface ResolvedVehicleImage {
  url: string
  source: string // "carsxe"
}

const ENDPOINT = "https://api.carsxe.com/images"

interface Candidate {
  url: string
  width: number
  height: number
  score: number
  colorMatch: boolean
}

// Strip trim/body noise that confuses CarsXE's model matching.
function cleanModel(model: string): string {
  return model
    .replace(/\b(sedan|coupe|hatchback|suv|4dr|2dr|4matic|awd|fwd|rwd)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Hosts that serve clean, text-free studio renders on a plain background.
const STUDIO_HOST = /cstatic-images|stock_photos|\/evox\/|kelleybluebookimages|netcarshow|edmunds-media|autoimage/i
// Hosts/paths that usually carry banners, watermarks or promo text.
const NOISY_HOST = /sm360|dealerinspire|imagetag|promo|banner|logo|sprite|watermark/i
// Obvious non-photo assets and watermarked stock-photo "comp" previews
// (Alamy /comp/, watermarked shutterstock/dreamstime/123rf/istock previews)
// that would show an ugly watermark on a customer-facing page.
const JUNK =
  /gstatic\.com|thumbnail|\.svg(\?|$)|badge|icon|alamy\.com\/comp|\/comp\/|watermark|shutterstock\.com\/image|dreamstime|123rf|istockphoto|gettyimages/i

// Base paint colours plus common OEM marketing names that map unambiguously to
// a base colour. Used to detect the colour a candidate photo actually shows
// (from its URL / source page) so we can prefer photos that match the vehicle's
// selected colour.
const COLOR_SYNONYMS: Record<string, string[]> = {
  white: ["white", "pearl", "ibis", "glacier", "carrara", "polar"],
  black: ["black", "mythos", "ebony", "obsidian"],
  silver: ["silver", "florett", "aluminium", "aluminum"],
  gray: ["gray", "grey", "daytona", "nardo", "graphite", "quantum", "monsoon", "typhoon"],
  red: ["red", "tango", "matador", "garnet", "crimson", "misano"],
  blue: ["blue", "navarra", "ultramarine", "estoril", "sepang", "cobalt"],
  green: ["green", "district", "goodwood"],
  yellow: ["yellow", "vegas", "imola"],
  orange: ["orange", "dragon"],
  brown: ["brown", "beige", "tan", "sakhir", "tobacco", "chestnut"],
  gold: ["gold", "sahara"],
  purple: ["purple", "violet", "merlot"],
}

// Normalise a free-text colour (e.g. the job-card value) to a base colour.
function normalizeColor(input?: string | null): string | null {
  if (!input) return null
  const s = input.toLowerCase()
  for (const [base, words] of Object.entries(COLOR_SYNONYMS)) {
    if (words.some((w) => s.includes(w))) return base
  }
  return null
}

// Detect which base colours are named in a candidate's URL / source page text.
function detectColors(text: string): Set<string> {
  const s = text.toLowerCase()
  const found = new Set<string>()
  for (const [base, words] of Object.entries(COLOR_SYNONYMS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(s))) found.add(base)
  }
  return found
}

function scoreCandidate(
  url: string,
  width: number,
  height: number,
  contextLink: string,
  reqColor: string | null,
): number | null {
  if (!/^https?:\/\//.test(url)) return null
  if (JUNK.test(url)) return null
  // Reject tiny images — real reference shots are large. When dimensions are
  // unknown (0), keep the candidate but don't reward it.
  if (width && height && (width < 500 || height < 280)) return null

  let score = 0
  if (STUDIO_HOST.test(url)) score += 100
  if (NOISY_HOST.test(url)) score -= 60
  // Prefer landscape (car profile/3-4 shots) over portrait crops.
  if (width && height) {
    const ratio = width / height
    if (ratio >= 1.3 && ratio <= 2.6) score += 30
    else if (ratio < 1.1) score -= 20
    score += Math.min(30, Math.round((width * height) / 200000)) // reward resolution, capped
  }
  // Prefer png (usually transparent/clean studio) slightly over jpg.
  if (/\.png(\?|$)/i.test(url)) score += 8

  // Colour matching (dominates host preference so colour wins over a clean but
  // wrong-colour studio render):
  //  - photo whose text names the requested colour  -> strong boost
  //  - photo that clearly shows a different colour   -> demote
  //  - colour-neutral photo (no colour in its text)  -> untouched, so the
  //    fixed-colour studio render remains the fallback when nothing matches.
  if (reqColor) {
    const detected = detectColors(`${url} ${contextLink}`)
    if (detected.has(reqColor)) score += 150
    else if (detected.size > 0) score -= 90
  }
  return score
}

function collectCandidates(json: unknown, reqColor: string | null): Candidate[] {
  if (!json || typeof json !== "object") return []
  const obj = json as Record<string, unknown>
  const arrays: unknown[] = []
  if (Array.isArray(obj.images)) arrays.push(...(obj.images as unknown[]))
  if (Array.isArray((obj as { data?: unknown }).data)) arrays.push(...((obj as { data: unknown[] }).data))
  if (Array.isArray((obj as { results?: unknown }).results)) arrays.push(...((obj as { results: unknown[] }).results))

  const out: Candidate[] = []
  for (const item of arrays) {
    let url: string | null = null
    let width = 0
    let height = 0
    let contextLink = ""
    if (typeof item === "string") {
      url = item
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>
      const candidate = rec.link ?? rec.url ?? rec.src ?? rec.image
      if (typeof candidate === "string") url = candidate
      if (typeof rec.width === "number") width = rec.width
      if (typeof rec.height === "number") height = rec.height
      if (typeof rec.contextLink === "string") contextLink = rec.contextLink
    }
    if (!url) continue
    const score = scoreCandidate(url, width, height, contextLink, reqColor)
    if (score === null) continue
    const colorMatch = reqColor ? detectColors(`${url} ${contextLink}`).has(reqColor) : false
    out.push({ url, width, height, score, colorMatch })
  }
  return out.sort((a, b) => b.score - a.score)
}

/**
 * Resolve a vehicle image via CarsXE using a tiered fallback that prioritises
 * model accuracy. Returns null only when every tier fails.
 */
export async function resolveVehicleImage(params: {
  make?: string | null
  model?: string | null
  year?: number | string | null
  color?: string | null
  trim?: string | null
}): Promise<ResolvedVehicleImage | null> {
  const key = process.env.CARSXE_API_KEY
  if (!key) return null

  const rawMake = (params.make || "").trim()
  const rawModel = cleanModel(params.model || "")
  if (!rawMake || !rawModel) return null

  const canon = canonicalizeVehicle(rawMake, rawModel)

  // Make/model pairs to try: canonical first, then raw user input if different.
  const pairs: { make: string; model: string }[] = [{ make: canon.make, model: canon.model }]
  if (canon.make.toLowerCase() !== rawMake.toLowerCase() || canon.model.toLowerCase() !== rawModel.toLowerCase()) {
    pairs.push({ make: rawMake, model: rawModel })
  }

  const year = params.year ? String(params.year) : ""
  const trim = params.trim ? String(params.trim) : ""
  const color = params.color ? String(params.color) : ""
  const reqColor = normalizeColor(color) // base colour used for scoring across all tiers

  // Query tiers — richest identity first, widening on each miss. Model accuracy
  // first: we always keep make+model; we only shed year/trim/colour.
  //
  // Colour preference: a studio render exists in only one fixed factory colour,
  // so the first (richest) tier often returns a clean-but-wrong-colour render.
  // Instead of returning that immediately, we keep the best candidate seen so
  // far and keep widening; the moment any tier yields a real colour MATCH we
  // return it. If no tier ever matches the colour, we return the best overall
  // (typically the clean studio render) as the fallback.
  let best: Candidate | null = null
  for (const p of pairs) {
    const tiers: Record<string, string>[] = []
    if (year && trim && color) tiers.push({ year, trim, color })
    if (year && color) tiers.push({ year, color })
    if (color) tiers.push({ color })
    if (year) tiers.push({ year })
    tiers.push({}) // make + model only (model family)

    // De-dup identical tier objects (e.g. when trim/color empty).
    const seen = new Set<string>()
    for (const extra of tiers) {
      const sig = JSON.stringify(extra)
      if (seen.has(sig)) continue
      seen.add(sig)
      const cand = await queryCarsXE(key, p.make, p.model, extra, reqColor)
      if (!cand) continue
      // A real colour match wins outright — stop searching.
      if (cand.colorMatch) return { url: cand.url, source: "carsxe" }
      if (!best || cand.score > best.score) best = cand
    }
  }

  if (best) return { url: best.url, source: "carsxe" }
  console.log("[v0] CarsXE returned no usable image for", canon.make, canon.model)
  return null
}

async function queryCarsXE(
  key: string,
  make: string,
  model: string,
  extra: Record<string, string>,
  reqColor: string | null,
): Promise<Candidate | null> {
  const qs = new URLSearchParams({ key, make, model, format: "json", ...extra })
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${ENDPOINT}?${qs.toString()}`, {
      signal: controller.signal,
      next: { revalidate: 86400 },
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.log("[v0] CarsXE image fetch non-OK:", res.status)
      return null
    }
    const json = await res.json()
    const candidates = collectCandidates(json, reqColor)
    if (!candidates.length) return null
    // Prefer a colour-matched candidate from THIS tier if one exists, else the
    // top-scored candidate.
    return candidates.find((c) => c.colorMatch) ?? candidates[0]
  } catch (err) {
    console.log("[v0] CarsXE image fetch failed:", (err as Error).message)
    return null
  }
}
