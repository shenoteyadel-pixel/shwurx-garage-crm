import type { WebsiteDocument } from "./types"
import { validateVehicleYear } from "./intake-validate"

export type ContactVehicle = {
  brandSlug: string | null
  serviceSlug: string | null
  brandName: string | null
  serviceName: string | null
  model: string | null
  year: number | null
}

export type ContactVehicleResult = { ok: true; vehicle: ContactVehicle } | { ok: false; fields: Record<string, string> }

const SLUG = /^[a-z0-9-]{1,60}$/

function clean(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""
}

/**
 * Optional structured vehicle context on the generic Contact form. Brand and
 * service must be visible entries in the PUBLISHED catalog (re-derived here,
 * never trusted from the client). The year follows the shared policy. When the
 * published document is unavailable, unverifiable slugs are dropped rather
 * than failing an otherwise valid contact.
 */
export function resolveContactVehicle(doc: WebsiteDocument | null, body: Record<string, unknown>): ContactVehicleResult {
  const fields: Record<string, string> = {}
  for (const k of ["brand", "service", "model"] as const) {
    if (body[k] !== undefined && body[k] !== null && typeof body[k] !== "string") fields[k] = "invalid"
  }
  const brandRaw = clean(body.brand, 61)
  const serviceRaw = clean(body.service, 61)
  if (brandRaw && !SLUG.test(brandRaw)) fields.brand = "invalid"
  if (serviceRaw && !SLUG.test(serviceRaw)) fields.service = "invalid"

  const brand = doc && brandRaw ? doc.brands.find((b) => b.slug === brandRaw && b.visible) : undefined
  const service = doc && serviceRaw ? doc.services.find((s) => s.slug === serviceRaw && s.visible) : undefined
  if (doc && brandRaw && !brand && !fields.brand) fields.brand = "unknown"
  if (doc && serviceRaw && !service && !fields.service) fields.service = "unknown"
  if (brand && service && !brand.serviceSlugs.includes(service.slug)) fields.service = "not_for_brand"

  const year = validateVehicleYear(body.year)
  if (!year.ok) fields.year = year.error

  if (Object.keys(fields).length) return { ok: false, fields }
  return {
    ok: true,
    vehicle: {
      brandSlug: brand?.slug ?? null,
      serviceSlug: service?.slug ?? null,
      brandName: brand?.name.en ?? null,
      serviceName: service?.name.en ?? null,
      model: clean(body.model, 60) || null,
      year: year.ok ? year.year : null,
    },
  }
}

/** Staff-readable vehicle lines prepended to the CRM lead message. */
export function vehicleSummary(v: ContactVehicle): string {
  return [
    v.brandName && `Brand: ${v.brandName}`,
    v.model && `Model: ${v.model}`,
    v.year && `Year: ${v.year}`,
    v.serviceName && `Service: ${v.serviceName}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function hasVehicleInput(body: Record<string, unknown>): boolean {
  return ["brand", "service", "model", "year"].some((k) => typeof body[k] === "string" && (body[k] as string).trim() !== "")
}
