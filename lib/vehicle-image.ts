import "server-only"

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

  const urls: string[] = []
  for (const item of arrays) {
    if (typeof item === "string" && /^https?:\/\//.test(item)) urls.push(item)
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>
      const candidate = rec.link ?? rec.url ?? rec.src ?? rec.image ?? rec.thumbnail
      if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) urls.push(candidate)
    }
  }
  if (!urls.length) return null
  // Prefer clean studio/stock renders (EVOX/Capital One, cstatic, stock media,
  // transparent PNGs) over noisy dealer-lot JPEGs.
  const studio = urls.find((u) =>
    /autoimage\.capitalone\.com|\/evox\/|stock-media|stock_photos|cstatic-images/i.test(u),
  )
  const png = urls.find((u) => /\.png(\?|$)/i.test(u))
  return studio ?? png ?? urls[0]
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

  const make = (params.make || "").trim()
  const model = cleanModel(params.model || "")
  if (!make || !model) return null

  const qs = new URLSearchParams({ key, make, model, format: "json" })
  if (params.year) qs.set("year", String(params.year))
  if (params.trim) qs.set("trim", String(params.trim))
  if (params.color) qs.set("color", String(params.color))

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${ENDPOINT}?${qs.toString()}`, {
      signal: controller.signal,
      // Cache at the fetch layer for a day; we also cache in the DB per job.
      next: { revalidate: 86400 },
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.log("[v0] CarsXE image fetch non-OK:", res.status)
      return null
    }
    const json = await res.json()
    const url = pickImageUrl(json)
    if (!url) {
      console.log("[v0] CarsXE returned no usable image for", make, model)
      return null
    }
    return { url, source: "carsxe" }
  } catch (err) {
    console.log("[v0] CarsXE image fetch failed:", (err as Error).message)
    return null
  }
}
