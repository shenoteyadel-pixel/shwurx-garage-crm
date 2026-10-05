import type { Settings } from "@/lib/settings"

/** The only settings columns the tracking tab may ever see. Rates, pricing, TRN etc. never leave the server. */
export const TRACKING_SETTING_KEYS = [
  "tracking_enabled",
  "ga4_measurement_id",
  "gtm_container_id",
  "meta_pixel_id",
  "google_site_verification",
] as const satisfies readonly (keyof Settings)[]

export type TrackingSettingsDTO = Pick<Settings, (typeof TRACKING_SETTING_KEYS)[number]>

export type ControlCenterAccess = {
  canManageWebsite: boolean
  canViewMarketing: boolean
  canManageMarketing: boolean
}

export function resolveControlCenterAccess(permissions: Iterable<string>): ControlCenterAccess | null {
  const p = new Set(permissions)
  const canManageWebsite = p.has("website.manage")
  const canManageMarketing = p.has("marketing.manage")
  const canViewMarketing = canManageMarketing || p.has("marketing.view")
  if (!canManageWebsite && !canViewMarketing) return null
  return { canManageWebsite, canViewMarketing, canManageMarketing }
}

export function pickTrackingSettings(s: Partial<Settings>): TrackingSettingsDTO {
  const out: Record<string, unknown> = {}
  for (const k of TRACKING_SETTING_KEYS) out[k] = s[k] ?? null
  return out as TrackingSettingsDTO
}
