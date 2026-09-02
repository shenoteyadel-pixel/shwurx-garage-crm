import "server-only"
import { canonicalizeVehicle } from "@/lib/vehicle"

/**
 * CarsXE Vehicle Images resolver.
 *
 * Fetches a representative image for a make/model/year(/color) from the CarsXE
 * Images API. Network + parsing is fully defensive: any failure returns null so
 * callers can fall back to the SVG silhouette. The API key is server-only.
 *
 * Docs: https://api.carsxe.com/docs/images  ->  GET https://api.carsxe.com/images
 */

export interface ResolvedVehicleImage {
  url: string
  source: string // e.g. "carsxe"
}

const ENDPOINT = "https://api.carsxe.com/images"

// Some CarsXE model strings differ from what users type; normalize a few.
function cleanModel(model: string): string {
  return model
    .replace(/\b(sedan|coupe|hatchback|suv|4dr|2dr|4matic|awd|fwd|rwd)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function pickImageUrl(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const obj = json as Record<string, unknown>

  // Most common shape: { images: [ { link | url | src } ] }
  const arrays: unknown[] = []
  if (Array.isArray(obj.images)) arrays.push(...(obj.images as unknown[]))
  if (Array.isArray((obj as { data?: unknown }).data)) arrays.push(...((obj as { data: unknown[] }).data))
  if (Array.isArray((obj as { results?: unknown }).results))
    arrays.push(...((obj as { results: unknown[] }).results))

  let urls: string[] = []
  for (const item of arrays) {
    if (typeof item === "string" && /^https?:\/\//.test(item)) urls.push(item)
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>
      const candidate = rec.link ?? rec.url ?? rec.src ?? rec.image ?? rec.thumbnail
      if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) urls.push(candidate)
    }
  }
  // Drop obvious non-vehicle junk (parts/accessories/logos) that sometimes rank in.
  const JUNK =
    /coilover|wheel|rim|tyre|tire|brake|spoiler|logo|badge|keychain|part|accessor|shopify|d2racing|\/promo\/|promotion|banner|dealer-?logo|coming[-_]?soon|comingsoon|no[-_]?image|placeholder|photo.?coming/i
  // If every candidate is junk/placeholder, return null so the caller falls
  // back to the clean SVG silhouette instead of showing a "Coming Soon" banner.
  urls = urls.filter((u) => !JUNK.test(u))
  if (!urls.length) return null
  // Prefer clean studio/stock renders (EVOX/Capital One, cstatic, netcarshow,
  // stock media). Otherwise trust CarsXE's own ranking and take the first.
  const studio = urls.find((u) =>
    /autoimage\.capitalone\.com|\/evox\/|stock-media|stock_photos|cstatic-images|netcarshow/i.test(u),
  )
  return studio ?? urls[0]
}

/**
 * Resolve a vehicle image via CarsXE. Returns null on any error / no match.
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

  // Canonical names (fixes typos/spacing/aliases -> e.g. "mercdes c200" -> Mercedes-Benz C-Class)
  const canon = canonicalizeVehicle(rawMake, rawModel)

  // Try the canonical make/model first, then fall back to the raw user input.
  const attempts: { make: string; model: string }[] = [{ make: canon.make, model: canon.model }]
  if (canon.make.toLowerCase() !== rawMake.toLowerCase() || canon.model.toLowerCase() !== rawModel.toLowerCase()) {
    attempts.push({ make: rawMake, model: rawModel })
  }

  for (const attempt of attempts) {
    const url = await queryCarsXE(key, attempt.make, attempt.model, params)
    if (url) return { url, source: "carsxe" }
  }
  console.log("[v0] CarsXE returned no usable image for", canon.make, canon.model)
  return null
}

async function queryCarsXE(
  key: string,
  make: string,
  model: string,
  params: { year?: number | string | null; color?: string | null; trim?: string | null },
): Promise<string | null> {
  const qs = new URLSearchParams({ key, make, model, format: "json" })
  if (params.year) qs.set("year", String(params.year))
  if (params.trim) qs.set("trim", String(params.trim))
  if (params.color) qs.set("color", String(params.color))

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
    return pickImageUrl(json)
  } catch (err) {
    console.log("[v0] CarsXE image fetch failed:", (err as Error).message)
    return null
  }
}
