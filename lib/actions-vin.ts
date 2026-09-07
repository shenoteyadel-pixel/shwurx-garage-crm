"use server"

import { normalizeBodyType } from "@/lib/vehicle-catalog"

export type VinDecodeResult = {
  vin: string
  make: string | null
  model: string | null
  year: number | null
  trim: string | null
  bodyType: string | null
  fuelType: string | null
  transmission: string | null
  drivetrain: string | null
  engine: string | null
  madeIn: string | null
}

export type VinDecodeResponse =
  | { ok: true; data: VinDecodeResult }
  | { ok: false; error: string; code: "invalid" | "not_found" | "quota" | "unconfigured" | "network" }

// A VIN is 17 chars, excluding I/O/Q to avoid ambiguity with 1/0.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i

/** Pick the first present, non-empty string from a list of candidate keys. */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
  }
  return null
}

/**
 * Decode a VIN via CarsXE's /specs endpoint. This is a real decode source —
 * we never guess. On any failure (bad key, exhausted quota, network, unknown
 * VIN) we return a typed error so the UI can fall back to manual entry.
 */
export async function decodeVin(vinInput: string): Promise<VinDecodeResponse> {
  const vin = vinInput.trim().toUpperCase()
  if (!VIN_RE.test(vin)) {
    return { ok: false, code: "invalid", error: "Enter a valid 17-character VIN." }
  }

  const key = process.env.CARSXE_API_KEY
  if (!key) {
    return { ok: false, code: "unconfigured", error: "VIN decoding is not configured." }
  }

  let json: Record<string, any>
  try {
    const url = `https://api.carsxe.com/specs?key=${encodeURIComponent(key)}&vin=${encodeURIComponent(vin)}&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" })
    json = (await res.json()) as Record<string, any>
  } catch {
    return { ok: false, code: "network", error: "Could not reach the VIN service. Enter details manually." }
  }

  // CarsXE returns success:false with a message for quota / unknown VIN.
  if (json?.success === false || json?.error) {
    const msg = String(json?.message || json?.error || "").toLowerCase()
    if (msg.includes("limit") || msg.includes("quota") || msg.includes("subscription")) {
      return { ok: false, code: "quota", error: "VIN lookup limit reached. Enter details manually." }
    }
    return { ok: false, code: "not_found", error: "No data found for this VIN. Enter details manually." }
  }

  // Specs live under `attributes` (sometimes `specs`); be defensive about shape.
  const attrs: Record<string, any> = json.attributes ?? json.specs ?? json
  const yearStr = pick(attrs, ["year", "Year", "model_year", "ModelYear"])
  const year = yearStr ? Number.parseInt(yearStr, 10) : null

  const result: VinDecodeResult = {
    vin,
    make: pick(attrs, ["make", "Make", "manufacturer"]),
    model: pick(attrs, ["model", "Model"]),
    year: year && Number.isFinite(year) ? year : null,
    trim: pick(attrs, ["trim", "Trim", "trim_level", "series", "Series", "style", "Style"]),
    bodyType: normalizeBodyType(pick(attrs, ["body_type", "body_style", "BodyClass", "type", "style", "category"])),
    fuelType: pick(attrs, ["fuel_type", "FuelTypePrimary", "fuel"]),
    transmission: pick(attrs, ["transmission", "TransmissionStyle", "transmission_type"]),
    drivetrain: pick(attrs, ["drive_type", "DriveType", "drivetrain"]),
    engine: pick(attrs, ["engine", "engine_size", "DisplacementL", "EngineModel"]),
    madeIn: pick(attrs, ["made_in", "PlantCountry", "manufactured_in"]),
  }

  if (!result.make && !result.model) {
    return { ok: false, code: "not_found", error: "No data found for this VIN. Enter details manually." }
  }

  return { ok: true, data: result }
}
