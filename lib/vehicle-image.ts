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
// Obvious non-photo assets.
const JUNK = /gstatic\.com|thumbnail|\.svg(\?|$)|badge|icon/i

function scoreCandidate(url: string, width: number, height: number): number | null {
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
  return score
}

function collectCandidates(json: unknown): Candidate[] {
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
    if (typeof item === "string") {
      url = item
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>
      const candidate = rec.link ?? rec.url ?? rec.src ?? rec.image
      if (typeof candidate === "string") url = candidate
      if (typeof rec.width === "number") width = rec.width
      if (typeof rec.height === "number") height = rec.height
    }
    if (!url) continue
    const score = scoreCandidate(url, width, height)
    if (score === null) continue
    out.push({ url, width, height, score })
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

  // Query tiers per spec — richest identity first, widening on each miss.
  // Model accuracy first: we always keep make+model; we only shed year/trim/colour.
  for (const p of pairs) {
    const tiers: Record<string, string>[] = []
    if (year && trim && color) tiers.push({ year, trim, color })
    if (year && color) tiers.push({ year, color })
    if (year) tiers.push({ year })
    tiers.push({}) // make + model only (model family)

    // De-dup identical tier objects (e.g. when trim/color empty).
    const seen = new Set<string>()
    for (const extra of tiers) {
      const sig = JSON.stringify(extra)
      if (seen.has(sig)) continue
      seen.add(sig)
      const url = await queryCarsXE(key, p.make, p.model, extra)
      if (url) return { url, source: "carsxe" }
    }
  }

  console.log("[v0] CarsXE returned no usable image for", canon.make, canon.model)
  return null
}

async function queryCarsXE(
  key: string,
  make: string,
  model: string,
  extra: Record<string, string>,
): Promise<string | null> {
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
    const candidates = collectCandidates(json)
    return candidates.length ? candidates[0].url : null
  } catch (err) {
    console.log("[v0] CarsXE image fetch failed:", (err as Error).message)
    return null
  }
}
