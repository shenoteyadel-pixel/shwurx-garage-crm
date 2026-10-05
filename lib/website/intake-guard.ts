import { cookies } from "next/headers"
import { canWriteIntake } from "./env"
import { PREVIEW_COOKIE } from "./store"

/** Hard cap on public intake bodies; real forms are well under 4 KB. */
export const MAX_INTAKE_BYTES = 16 * 1024

/**
 * One isolation policy for every public intake route (leads, appointments,
 * enquiries, analytics). On previews or in an editor's draft preview, requests
 * are validated but never persisted, notified, emailed or counted.
 */
export async function intakeIsDryRun(): Promise<boolean> {
  if (!canWriteIntake()) return true
  const jar = await cookies()
  return !!jar.get(PREVIEW_COOKIE)?.value
}

/** Reads a JSON body with a size bound. Returns null when too large or invalid. */
export async function readBoundedJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_INTAKE_BYTES) return null
  const text = await request.text().catch(() => "")
  if (text.length > MAX_INTAKE_BYTES) return null
  try {
    const v = JSON.parse(text || "{}")
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Digits only, with a leading UAE 0 / 00 normalised to the 971 country code. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.startsWith("05") && d.length === 10) d = "971" + d.slice(1)
  return d
}
