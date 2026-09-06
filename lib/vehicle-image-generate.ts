import "server-only"
import { createHash } from "crypto"
import { generateImage } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { canonicalizeVehicle } from "@/lib/vehicle"
import { removeWhiteBackground, uploadVehiclePng } from "@/lib/vehicle-image-cutout"

// One consistent studio model + framing for EVERY car, so the whole board looks
// uniform. gpt-image-1 gives the best factory-correct body shape and a clean
// pure-white studio background that cuts out crisply. The plain gateway id keeps
// auth zero-config in v0 previews and on Vercel.
const IMAGE_MODEL = "openai/gpt-image-1"
const IMAGE_SIZE = "1536x1024" as const
const PREFIX = "generated"

export type VehicleForImage = {
  year?: number | string | null
  make?: string | null
  model?: string | null
  color?: string | null
}

function cacheKey(year: string, make: string, model: string, color: string) {
  return createHash("sha1").update(`v2|${year}|${make}|${model}|${color}`.toLowerCase()).digest("hex").slice(0, 20)
}

function buildPrompt(year: string, make: string, model: string, color: string) {
  const colorText = color ? `${color} ` : ""
  const yearText = year ? `${year} ` : ""
  // A tightly constrained prompt keeps angle, framing, lighting and background
  // identical across cars — the key to a uniform board — while the specific
  // year/make/model/colour makes it the correct vehicle from the job card.
  return [
    `A photorealistic studio product photo of a single ${colorText}${yearText}${make} ${model} car.`,
    "Exact factory-correct body shape, badges and proportions for that specific make, model and year.",
    "Three-quarter front view from a slightly low angle, front of the car facing left, the entire vehicle fully in frame with margin around it.",
    "Isolated on a pure solid white seamless background (#ffffff), even soft studio lighting, no shadow cast on the background, no floor reflection, no scenery, no people, no text, no watermark.",
    "Sharp focus, high detail, centered composition.",
  ].join(" ")
}

/**
 * Generate one uniform studio image for a vehicle, cut it out to a transparent
 * PNG, store it, and return the public URL. Content-addressed by
 * year/make/model/colour so each distinct vehicle is only generated once.
 * Returns null on any failure so callers can fall back to the illustration.
 */
export async function generateVehicleImage(v: VehicleForImage): Promise<string | null> {
  const canon = canonicalizeVehicle(v.make ?? "", v.model ?? "")
  const make = canon.make || (v.make ?? "").trim()
  const model = canon.model || (v.model ?? "").trim()
  const color = (v.color ?? "").trim()
  const year = v.year ? String(v.year).trim() : ""
  if (!make && !model) return null

  try {
    const { image } = await generateImage({
      model: gateway.imageModel(IMAGE_MODEL),
      prompt: buildPrompt(year, make, model, color),
      size: IMAGE_SIZE,
      abortSignal: AbortSignal.timeout(110000),
    })
    const raw = Buffer.from(image.uint8Array)
    const cut = (await removeWhiteBackground(raw)) ?? raw
    const url = await uploadVehiclePng(cut, PREFIX, cacheKey(year, make, model, color))
    if (!url) return null
    // Cache-bust so a regenerated key is picked up immediately.
    return `${url}?v=${cacheKey(year, make, model, color)}`
  } catch (err) {
    console.log("[v0] generateVehicleImage failed:", (err as Error).message)
    return null
  }
}
