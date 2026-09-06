import "server-only"
import { generateVehicleImage } from "@/lib/vehicle-image-generate"

/**
 * Vehicle image resolver.
 *
 * Every card on the board should show the SAME style of image — a clean,
 * factory-correct studio shot of the exact vehicle on the job card — at the
 * same quality and framing. We generate that image with an AI studio model
 * (see `vehicle-image-generate.ts`) rather than scraping the web, which gives
 * uniform results and picks the correct make/model/year/colour every time.
 *
 * The previous CarsXE-based scraper was removed: it was quota-capped and often
 * returned the wrong body (e.g. a full-size Range Rover for an Evoque) or a
 * missing image that fell back to the cartoon silhouette.
 *
 * Returns null on any failure so callers keep the existing image / silhouette.
 * Note: generation is slow (~30-60s), so interactive paths should resolve the
 * image in the background (via `after()`), not block the user on it.
 */

export interface ResolvedVehicleImage {
  url: string
  source: string // "ai-studio"
}

export async function resolveVehicleImage(params: {
  make?: string | null
  model?: string | null
  year?: number | string | null
  color?: string | null
  trim?: string | null
}): Promise<ResolvedVehicleImage | null> {
  const url = await generateVehicleImage({
    year: params.year,
    make: params.make,
    model: params.model,
    color: params.color,
  })
  return url ? { url, source: "ai-studio" } : null
}
