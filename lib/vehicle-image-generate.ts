import "server-only"
import { createHash } from "crypto"
import { generateImage } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { canonicalizeVehicle, type BodyType } from "@/lib/vehicle"
import { catalogBodyType } from "@/lib/vehicle-catalog"
import sharp from "sharp"
import { uploadVehiclePng } from "@/lib/vehicle-image-cutout"

// Crop to the car's bounding box so wheels sit on the card/lift edge, and keep
// the file small enough for phones.
async function trimTransparent(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "none" })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
      .resize({ width: 1000, height: 640, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    return input
  }
}

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
  trim?: string | null // variant/trim, e.g. "SL 63 AMG", "S 580", "720S Spider"
  generation?: string | null // chassis/generation code, e.g. "R232", "W223"
}

function cacheKey(year: string, make: string, model: string, color: string, trim: string, generation: string) {
  // Bump the version prefix whenever the prompt changes so every vehicle
  // regenerates instead of serving a stale cached render.
  return createHash("sha1")
    .update(`v12|${year}|${make}|${model}|${generation}|${trim}|${color}`.toLowerCase())
    .digest("hex")
    .slice(0, 20)
}

// A short body-shape phrase so the model renders the correct silhouette
// (a roadster stays a roadster, an SUV stays tall) instead of guessing.
const BODY_PHRASE: Record<BodyType, string> = {
  sedan: "a four-door sedan",
  suv: "a tall SUV",
  coupe: "a two-door coupe",
  convertible: "an open-top two-seat convertible roadster",
  hatchback: "a compact hatchback",
  pickup: "a pickup truck",
  van: "a van / MPV",
  sports: "a low, wide two-seat supercar",
}

// gpt-image-1 has a strong prior to paint luxury cars (S-Class, Evoque) black,
// which overrides a plain colour mention. Describing an explicit, vivid paint
// name and repeating it forces the requested colour through.
function paintPhrase(color: string): string {
  const c = color.trim().toLowerCase()
  const map: Record<string, string> = {
    white: "bright pearl WHITE",
    black: "deep gloss BLACK",
    grey: "metallic SILVER-GREY",
    gray: "metallic SILVER-GREY",
    silver: "bright metallic SILVER",
    red: "vivid RED",
    blue: "rich BLUE",
    green: "deep GREEN",
    orange: "bright ORANGE",
    yellow: "bright YELLOW",
    brown: "metallic BROWN",
    gold: "champagne GOLD",
    beige: "light BEIGE",
  }
  return map[c] || (color ? color.toUpperCase() : "factory-colour")
}

// gpt-image-1's native transparency (and earlier white/charcoal flood-fills)
// erased light silver/white body panels along with the backdrop, leaving a
// faded "sketch" of the car. A saturated chroma key never matches real paint,
// so it can be removed exactly. Green cars use a magenta key instead.
type KeyColor = "green" | "magenta"
function keyFor(color: string): KeyColor {
  return /green|lime|olive|teal|mint|emerald/i.test(color) ? "magenta" : "green"
}
const keyName = (color: string) => (keyFor(color) === "green" ? "bright green" : "bright magenta")
const keyHex = (color: string) => (keyFor(color) === "green" ? "#00FF00" : "#FF00FF")

async function removeChromaKey(input: Buffer, key: KeyColor): Promise<Buffer> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let o = 0; o < data.length; o += 4) {
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    // How strongly this pixel leans toward the key colour.
    const spill = key === "green" ? g - Math.max(r, b) : Math.min(r, b) - g
    // Reflected key light tints glass and paint; the car is never the key
    // colour, so clamp that channel back to neutral everywhere.
    if (key === "green" && g > Math.max(r, b)) data[o + 1] = Math.max(r, b)
    if (key === "magenta" && Math.min(r, b) > g) {
      const excess = Math.min(r, b) - g
      data[o] = r - excess
      data[o + 2] = b - excess
    }
    if (spill <= 25) continue
    if (spill >= 90) {
      data[o + 3] = 0
      continue
    }
    // Soft edge: fade alpha and strip the key tint (despill).
    data[o + 3] = Math.round(255 * (1 - (spill - 25) / 65))
    if (key === "green") data[o + 1] = Math.max(r, b)
    else {
      const m = g
      data[o] = Math.min(r, m + 10)
      data[o + 2] = Math.min(b, m + 10)
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

function buildPrompt(year: string, make: string, model: string, color: string, trim: string, body: BodyType | undefined, generation: string) {
  const brand = [make, model].filter(Boolean).join(" ").trim()
  const yearText = year ? `${year} ` : ""
  const paint = paintPhrase(color)
  // State the exact trim/variant as its own clause (avoids awkward token
  // duplication like "SL SL 63 AMG" while still pinning the right variant),
  // and describe the correct body shape when we know it from the catalog.
  const trimClause = trim ? ` This is specifically the ${trim} variant, so render that exact trim's body kit, wheels and details.` : ""
  // The generation/chassis code pins the exact styling era so a current-gen car
  // never renders as its predecessor (e.g. R232 SL, not the older R231).
  const genClause = generation ? ` It is the ${generation} generation specifically — use that generation's exact bodywork, lights and styling, not an earlier or later generation.` : ""
  const bodyClause = body ? ` The overall body style is ${BODY_PHRASE[body]}.` : ""
  // A tightly constrained prompt keeps angle, framing, lighting and background
  // identical across cars — the key to a uniform board — while the specific
  // year/make/model/colour makes it the correct vehicle from the job card.
  // Use a DARK CHARCOAL backdrop: gpt-image-1 otherwise darkens white/silver
  // cars to keep contrast against a light background, painting them black. A
  // dark backdrop flips that so light colours render correctly, and the dark
  // cutout step removes the charcoal cleanly.
  const colourLines = color
    ? [
        `A photorealistic studio product photograph of a single ${yearText}${brand} car with a ${paint} exterior paint colour.`,
        `The entire car body is ${paint}. This is essential: the paint colour must be ${paint}, covering every body panel, roof, doors, bonnet and bumpers — do not darken it, do not render it black.`,
      ]
    : [
        `A photorealistic studio product photograph of a single ${yearText}${brand} car in a rich, realistic factory metallic paint colour that is popular for this model.`,
      ]
  return [
    ...colourLines,
    `Exact factory-correct body shape and proportions for a ${brand}, with the correct genuine ${make} manufacturer badge and grille — never another car brand's logo.${genClause}${trimClause}${bodyClause}`,
    "Three-quarter front view from a slightly low angle, the front of the car facing to the left, the whole vehicle centred and fully in frame with even margin on all sides, always the same camera distance and framing.",
    "All four tyres, the wheels, windscreen and windows are fully and solidly rendered with realistic glass tint and black rubber tyres.",
    `Isolated on a perfectly flat, uniform, pure chroma-key ${keyName(color)} background (${keyHex(color)}) filling the whole frame edge to edge, with soft professional automotive studio lighting, no scenery, no floor, no shadow, no reflection. The ${keyName(color)} must never appear on the car itself.`,
    // Critical: stop the model baking the year / a number plate / captions onto the car.
    "Absolutely no text, no numbers, no license plate, no captions, no watermark, no extra logos anywhere in the image. The number plate area must be blank.",
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
  const trim = (v.trim ?? "").trim()
  const generation = (v.generation ?? "").trim()
  const body = catalogBodyType(make, model)
  if (!make && !model) return null

  try {
    const key = cacheKey(year, make, model, color, trim, generation)
    const { image } = await generateImage({
      model: gateway.imageModel(IMAGE_MODEL),
      prompt: buildPrompt(year, make, model, color, trim, body, generation),
      size: IMAGE_SIZE,
      providerOptions: { openai: { background: "opaque", quality: "medium", output_format: "png" } },
      abortSignal: AbortSignal.timeout(110000),
    })
    const raw = Buffer.from(image.uint8Array)
    const keyed = await removeChromaKey(raw, keyFor(color))
    const trimmed = await trimTransparent(keyed)
    const url = await uploadVehiclePng(trimmed, PREFIX, key)
    if (!url) return null
    // Cache-bust so a regenerated key is picked up immediately.
    return `${url}?v=${key}`
  } catch (err) {
    console.log("[v0] generateVehicleImage failed:", (err as Error).message)
    return null
  }
}
