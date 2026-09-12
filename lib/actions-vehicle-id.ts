"use server"

import { generateText, Output } from "ai"
import { z } from "zod"
import { confirmCatalog, normalizeBodyType, searchCatalog } from "@/lib/vehicle-catalog"
import { decodeVin, type VinDecodeResult } from "@/lib/actions-vin"

export type Confidence = "high" | "medium" | "low"

export type IdField = { value: string; confidence: Confidence }

export type VehicleIdentification = {
  source: "vin+ai" | "vin" | "ai-search" | "catalog"
  make: IdField | null
  model: IdField | null
  year: IdField | null
  generation: IdField | null
  variant: IdField | null
  engine: IdField | null
  bodyType: IdField | null
  inCatalog: boolean
  reviewRequired: boolean
  // Fields where the VIN decode and the AI/catalog disagree — both values shown.
  conflicts: { field: string; values: string[] }[]
  note: string | null
}

export type IdentifyResponse =
  | { ok: true; data: VehicleIdentification }
  | { ok: false; error: string }

// A fast, capable model with strong general automotive knowledge and reliable
// structured output. Plain gateway id keeps auth zero-config in v0 / on Vercel.
const ID_MODEL = "openai/gpt-4.1-mini"

const ConfEnum = z.enum(["high", "medium", "low"])

const IdSchema = z.object({
  make: z.string().describe("Canonical manufacturer, e.g. 'Mercedes-Benz', 'McLaren', 'BMW'. Empty string if unknown."),
  makeConfidence: ConfEnum,
  model: z.string().describe("Canonical model family, e.g. 'SL', 'S-Class', '720S', 'X5'. Empty string if unknown."),
  modelConfidence: ConfEnum,
  year: z.string().describe("4-digit model year, or empty string if not certain."),
  yearConfidence: ConfEnum,
  generation: z.string().describe("Generation / chassis code, e.g. 'R232', 'W223', 'F95'. Empty string if unknown."),
  generationConfidence: ConfEnum,
  variant: z.string().describe("Full trim/variant, e.g. 'SL 63 AMG', 'S 580 4MATIC', '720S Spider'. Empty string if unknown."),
  variantConfidence: ConfEnum,
  engine: z.string().describe("Engine description, e.g. '4.0L V8 biturbo'. Empty string if unknown."),
  engineConfidence: ConfEnum,
  bodyType: z.string().describe("Body style: sedan, suv, coupe, convertible, hatchback, pickup, van, or sports. Empty if unknown."),
})

type IdRaw = z.infer<typeof IdSchema>

function rank(c: Confidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1
}
function best(a: Confidence, b: Confidence): Confidence {
  return rank(a) >= rank(b) ? a : b
}
function field(value: string | null | undefined, confidence: Confidence): IdField | null {
  const v = (value ?? "").trim()
  return v ? { value: v, confidence } : null
}
function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function runAi(context: string): Promise<IdRaw | null> {
  try {
    const { output } = await generateText({
      model: ID_MODEL,
      output: Output.object({ schema: IdSchema }),
      abortSignal: AbortSignal.timeout(20000),
      system:
        "You are an expert automotive identification assistant for a UAE luxury/exotic car workshop. " +
        "Normalize inconsistent brand and model naming to their canonical form (e.g. 'MB'/'Mercedes'/'merc' -> 'Mercedes-Benz'; " +
        "'SL63'/'AMG SL63' -> model 'SL', variant 'SL 63 AMG'; 'X5M'/'X5 M Competition' -> model 'X5', variant 'X5 M Competition'). " +
        "When VIN-decoded evidence is provided, treat it as strong ground truth for make/model/year and derive the exact generation/chassis code and trim from it. " +
        "CRITICAL: never guess. If you are not confident about a field, set its confidence to 'low' and leave the value as an empty string. " +
        "Prefer well-known market variants. Return generation/chassis codes when you are confident (e.g. Mercedes SL 2022+ = R232, S-Class 2021+ = W223).",
      prompt: context,
    })
    return output as IdRaw
  } catch (err) {
    console.log("[v0] vehicle identify AI failed:", (err as Error).message)
    return null
  }
}

function buildConflicts(decoded: VinDecodeResult | null, id: VehicleIdentification): void {
  if (!decoded) return
  const checks: [string, string | null, string | null][] = [
    ["make", decoded.make, id.make?.value ?? null],
    ["model", decoded.model, id.model?.value ?? null],
    ["year", decoded.year ? String(decoded.year) : null, id.year?.value ?? null],
  ]
  for (const [name, dVal, iVal] of checks) {
    if (dVal && iVal && norm(dVal) !== norm(iVal) && !norm(iVal).includes(norm(dVal)) && !norm(dVal).includes(norm(iVal))) {
      id.conflicts.push({ field: name, values: [dVal, iVal] })
    }
  }
}

/**
 * Hybrid vehicle identification.
 *
 * Order: (1) real VIN decode when a VIN is given, (2) AI normalization of the
 * decoded data or free-text query, (3) confirmation against the local catalog
 * to raise/lower confidence and canonicalize spellings. Returns per-field
 * confidence and flags REVIEW REQUIRED when sources disagree or confidence is
 * low. Callers apply the result as a SUGGESTION — nothing is auto-saved.
 */
export async function identifyVehicle(input: {
  vin?: string
  query?: string
  decoded?: VinDecodeResult
}): Promise<IdentifyResponse> {
  let decoded: VinDecodeResult | null = input.decoded ?? null

  // STEP 1 — real VIN decode (skip if the caller already decoded).
  if (!decoded && input.vin && input.vin.trim()) {
    const res = await decodeVin(input.vin)
    if (res.ok) decoded = res.data
  }

  const query = (input.query ?? "").trim()
  const rawVin = (input.vin ?? "").trim().toUpperCase()
  if (!decoded && !query && !rawVin) {
    return { ok: false, error: "Enter a VIN or a search term to identify the vehicle." }
  }

  // STEP 2 — AI normalization.
  // When the VIN decode succeeded we hand the AI the decoded ground truth.
  // When it did NOT (e.g. the VIN service is unavailable or over quota) but a
  // VIN was supplied, we still ask the AI to identify the car directly from the
  // VIN — the World Manufacturer Identifier (first 3 chars) and VDS encode the
  // make, region and often model/year. Free-text search is the final option.
  const context = decoded
    ? `VIN-decoded raw data (ground truth for make/model/year):\n${JSON.stringify(
        {
          vin: decoded.vin,
          make: decoded.make,
          model: decoded.model,
          year: decoded.year,
          trim: decoded.trim,
          bodyType: decoded.bodyType,
          engine: decoded.engine,
          fuelType: decoded.fuelType,
          transmission: decoded.transmission,
          drivetrain: decoded.drivetrain,
          madeIn: decoded.madeIn,
        },
        null,
        2,
      )}\n\nIdentify and normalize this exact vehicle.`
    : query
      ? `Identify and normalize this vehicle from the user's search text: "${query}"`
      : `Identify this vehicle from its VIN / chassis number: "${rawVin}". ` +
        `Decode the World Manufacturer Identifier (first 3 characters) and the ` +
        `Vehicle Descriptor Section to determine make, region and, where the ` +
        `pattern is well known, the model and model year. Only fill fields you ` +
        `are genuinely confident about; leave the rest as empty strings with low confidence.`

  const ai = await runAi(context)

  // Graceful fallback when AI is unavailable: use decode + catalog search only.
  if (!ai) return fallbackIdentify(decoded, query || rawVin)

  // STEP 3 — confirm against the local catalog (canonical spellings + known flags).
  const confirmed = confirmCatalog(ai.make || decoded?.make, ai.model || decoded?.model, ai.variant || decoded?.trim)

  const id: VehicleIdentification = {
    source: decoded ? "vin+ai" : "ai-search",
    make: field(confirmed.make, confirmed.makeKnown ? "high" : (ai.makeConfidence as Confidence)),
    model: field(confirmed.model, confirmed.modelKnown ? best("high", ai.modelConfidence as Confidence) : (ai.modelConfidence as Confidence)),
    year: field(ai.year || (decoded?.year ? String(decoded.year) : ""), decoded?.year ? "high" : (ai.yearConfidence as Confidence)),
    generation: field(ai.generation, ai.generationConfidence as Confidence),
    variant: field(confirmed.variant, confirmed.variantKnown ? best("high", ai.variantConfidence as Confidence) : (ai.variantConfidence as Confidence)),
    engine: field(ai.engine || decoded?.engine || "", ai.engine ? (ai.engineConfidence as Confidence) : "medium"),
    bodyType: null,
    inCatalog: confirmed.makeKnown && confirmed.modelKnown,
    reviewRequired: false,
    conflicts: [],
    note: null,
  }

  // Body: catalog is authoritative, else normalize AI/decoded string.
  const body = confirmed.body ?? normalizeBodyType(ai.bodyType) ?? normalizeBodyType(decoded?.bodyType)
  id.bodyType = body ? { value: body, confidence: confirmed.body ? "high" : "medium" } : null

  buildConflicts(decoded, id)

  // REVIEW REQUIRED when core identity is low-confidence or sources disagree.
  const core = [id.make, id.model, id.year, id.variant]
  const anyLow = core.some((f) => f && f.confidence === "low")
  const missingCore = !id.make || !id.model
  id.reviewRequired = id.conflicts.length > 0 || anyLow || missingCore
  if (id.reviewRequired) {
    id.note = id.conflicts.length
      ? "Sources disagree — confirm the correct values before saving."
      : "Low confidence on some fields — please verify before saving."
  }

  return { ok: true, data: id }
}

/** Non-AI path: build an identification from decode + catalog search only. */
function fallbackIdentify(decoded: VinDecodeResult | null, query: string): IdentifyResponse {
  if (decoded) {
    const confirmed = confirmCatalog(decoded.make, decoded.model, decoded.trim)
    const body = confirmed.body ?? normalizeBodyType(decoded.bodyType)
    return {
      ok: true,
      data: {
        source: "vin",
        make: field(confirmed.make, confirmed.makeKnown ? "high" : "medium"),
        model: field(confirmed.model, confirmed.modelKnown ? "high" : "medium"),
        year: field(decoded.year ? String(decoded.year) : "", decoded.year ? "high" : "low"),
        generation: null,
        variant: field(confirmed.variant, confirmed.variantKnown ? "high" : "low"),
        engine: field(decoded.engine || "", decoded.engine ? "medium" : "low"),
        bodyType: body ? { value: body, confidence: confirmed.body ? "high" : "medium" } : null,
        inCatalog: confirmed.makeKnown && confirmed.modelKnown,
        reviewRequired: !confirmed.makeKnown || !confirmed.modelKnown,
        conflicts: [],
        note: "Identified from VIN data only (AI unavailable). Please verify.",
      },
    }
  }

  const hit = searchCatalog(query, 1)[0]
  if (!hit) {
    return { ok: false, error: "Couldn't identify that vehicle. Enter the details manually." }
  }
  return {
    ok: true,
    data: {
      source: "catalog",
      make: { value: hit.make, confidence: "high" },
      model: { value: hit.model, confidence: "high" },
      year: null,
      generation: null,
      variant: hit.variant ? { value: hit.variant, confidence: "medium" } : null,
      engine: null,
      bodyType: { value: hit.body, confidence: "high" },
      inCatalog: true,
      reviewRequired: false,
      conflicts: [],
      note: "Matched from the local catalog (AI unavailable).",
    },
  }
}
