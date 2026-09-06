import "server-only"
import { createHash } from "crypto"
import sharp from "sharp"
import { createServiceClient } from "@/lib/supabase/server"

const BUCKET = "vehicle-photos"
const PREFIX = "cutouts"

/**
 * Turn a studio car photo (often shot on a solid white/light background) into a
 * clean transparent PNG so it can sit naturally on the workshop-lift backdrop
 * instead of showing as a white rectangle.
 *
 * Strategy: flood-fill from the image borders, clearing connected near-white
 * pixels to transparent. Because it only removes background CONNECTED to the
 * edges, white/silver bodywork in the centre of the car is preserved. The
 * result is uploaded to Supabase Storage and the public URL returned. Any
 * failure returns null so the caller keeps the original photo URL.
 *
 * Results are content-addressed by the source URL, so a given photo is only
 * ever processed and stored once.
 */
export async function cutoutVehicleImage(sourceUrl: string): Promise<string | null> {
  try {
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) return null

    const supabase = createServiceClient()
    const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 20)
    const path = `${PREFIX}/${hash}.png`

    // Already processed? Reuse it.
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    if (pub?.publicUrl && (await urlExists(pub.publicUrl))) return pub.publicUrl

    // Download the source image (bounded).
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)
    let buf: Buffer
    try {
      const res = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 SHWURX-CRM" },
      })
      if (!res.ok) return null
      buf = Buffer.from(await res.arrayBuffer())
    } finally {
      clearTimeout(timeout)
    }

    const processed = await removeWhiteBackground(buf)
    if (!processed) return null

    const { error } = await supabase.storage.from(BUCKET).upload(path, processed, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    })
    if (error) {
      console.log("[v0] cutout upload failed:", error.message)
      return null
    }
    const { data: finalPub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return finalPub?.publicUrl ?? null
  } catch (err) {
    console.log("[v0] cutoutVehicleImage failed:", (err as Error).message)
    return null
  }
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Border flood-fill white-background removal on a raw RGBA buffer.
 * Returns a PNG buffer, or null if the image doesn't look like it has a
 * removable light background (so we don't wreck real edge-to-edge photos).
 */
async function removeWhiteBackground(input: Buffer): Promise<Buffer | null> {
  // Normalise onto a bounded canvas; trim keeps the car large in frame.
  const img = sharp(input, { failOn: "none" }).rotate().resize({
    width: 1000,
    height: 640,
    fit: "inside",
    withoutEnlargement: true,
  })

  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels } = info
  if (channels !== 4 || w < 8 || h < 8) return null

  const N = w * h
  const isBg = new Uint8Array(N) // 1 = background candidate (light neutral)
  // Studio backgrounds are light and near-neutral (white OR light-grey gradient).
  // Testing brightness + low saturation catches both, while real bodywork/tyres
  // (coloured or dark) and shadows are kept.
  const neutralBright = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return min >= 140 && max - min <= 30
  }

  for (let i = 0; i < N; i++) {
    const o = i * 4
    if (neutralBright(data[o], data[o + 1], data[o + 2])) isBg[i] = 1
  }

  // If the border isn't mostly background, this isn't a studio photo; bail so we
  // don't damage a full-bleed real-world photo.
  let borderBg = 0
  let borderTotal = 0
  for (let x = 0; x < w; x++) {
    borderTotal += 2
    if (isBg[x]) borderBg++
    if (isBg[(h - 1) * w + x]) borderBg++
  }
  for (let y = 0; y < h; y++) {
    borderTotal += 2
    if (isBg[y * w]) borderBg++
    if (isBg[y * w + (w - 1)]) borderBg++
  }
  if (borderBg / borderTotal < 0.55) return null

  // Flood fill from every border pixel through connected background.
  const visited = new Uint8Array(N)
  const stack = new Int32Array(N)
  let sp = 0
  const pushIf = (idx: number) => {
    if (idx >= 0 && idx < N && !visited[idx] && isBg[idx]) {
      visited[idx] = 1
      stack[sp++] = idx
    }
  }
  for (let x = 0; x < w; x++) {
    pushIf(x)
    pushIf((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    pushIf(y * w)
    pushIf(y * w + (w - 1))
  }
  const cleared = new Uint8Array(N)
  while (sp > 0) {
    const idx = stack[--sp]
    cleared[idx] = 1
    data[idx * 4 + 3] = 0 // transparent
    const x = idx % w
    const y = (idx / w) | 0
    if (x > 0) pushIf(idx - 1)
    if (x < w - 1) pushIf(idx + 1)
    if (y > 0) pushIf(idx - w)
    if (y < h - 1) pushIf(idx + w)
  }

  // 1px edge feather: soften opaque pixels that touch a cleared pixel and are
  // themselves soft-white, to kill the jagged halo left by the hard threshold.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (cleared[idx]) continue
      const o = idx * 4
      if (data[o + 3] === 0) continue
      const touchesCleared =
        (x > 0 && cleared[idx - 1]) ||
        (x < w - 1 && cleared[idx + 1]) ||
        (y > 0 && cleared[idx - w]) ||
        (y < h - 1 && cleared[idx + w])
      if (touchesCleared && neutralBright(data[o], data[o + 1], data[o + 2])) {
        data[o + 3] = 70
      }
    }
  }

  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
