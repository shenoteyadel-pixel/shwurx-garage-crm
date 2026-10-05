/**
 * Shared intake validation used by the enquiry route AND the enquiry form, so
 * client and server agree. Route files may only export Next route handlers and
 * config, so these live here.
 */

export const MIN_VEHICLE_YEAR = 2016

export type YearResult = { ok: true; year: number | null } | { ok: false; error: "invalid" | "out_of_range" }

/**
 * Validates the RAW year before any normalization: "20160" is rejected, never
 * truncated to 2016. Empty/absent is allowed (year is optional).
 */
export function validateVehicleYear(raw: unknown, now: Date = new Date()): YearResult {
  if (raw === undefined || raw === null || raw === "") return { ok: true, year: null }
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : null
  if (text === null || !/^\d{4}$/.test(text)) return { ok: false, error: "invalid" }
  const year = Number(text)
  if (year < MIN_VEHICLE_YEAR || year > now.getFullYear() + 1) return { ok: false, error: "out_of_range" }
  return { ok: true, year }
}

/** Services selectable for a brand: all when no brand is chosen, else only the ones it offers. */
export function servicesForBrand<S extends { slug: string }>(
  services: S[],
  brand: { serviceSlugs: string[] } | null | undefined,
): S[] {
  return brand ? services.filter((s) => brand.serviceSlugs.includes(s.slug)) : services
}
