/**
 * Website analytics configuration (GA4 / GTM / Google Ads / Meta / Search
 * Console). Stored inside the versioned website document so it is edited only
 * in Website Center and follows draft → publish → restore.
 *
 * Pure module: no server or browser APIs, so it is unit-testable.
 * Provider IDs are never invented — an empty field means "not configured".
 */

export type TagOwner = "gtm" | "gtag" | "none"
export type ConversionKey = "lead" | "appointment" | "phone_click" | "whatsapp_click"
export const CONVERSION_KEYS: readonly ConversionKey[] = ["lead", "appointment", "phone_click", "whatsapp_click"]

export interface AnalyticsConfig {
  /** false = never edited in Website Center; legacy settings stay in effect */
  managed: boolean
  enabled: boolean
  /** the single owner of Google tags and conversion events (prevents duplicates) */
  owner: TagOwner
  gtmId: string
  ga4Id: string
  adsId: string
  adsLabels: Record<ConversionKey, string>
  events: Record<ConversionKey, string>
  metaPixelId: string
  /** Google Ads customer ID (e.g. 154-133-2403) — account reference only, never a tag ID */
  adsCustomerId: string
  searchConsoleToken: string
  /** days a stored first/latest touch stays valid before it expires */
  retentionDays: number
  /** third-party tags load only on these hostnames */
  allowedHosts: string[]
  /** Consent Mode v2: storage denied until the visitor accepts */
  consentRequired: boolean
}

export const DEFAULT_EVENTS: Record<ConversionKey, string> = {
  lead: "generate_lead",
  appointment: "appointment_request_received",
  phone_click: "phone_click",
  whatsapp_click: "whatsapp_click",
}

export const DEFAULT_ANALYTICS: AnalyticsConfig = {
  managed: false,
  enabled: false,
  owner: "none",
  gtmId: "",
  ga4Id: "",
  adsId: "",
  adsLabels: { lead: "", appointment: "", phone_click: "", whatsapp_click: "" },
  events: { ...DEFAULT_EVENTS },
  metaPixelId: "",
  adsCustomerId: "",
  searchConsoleToken: "",
  retentionDays: 90,
  allowedHosts: [],
  consentRequired: true,
}

/**
 * Verified public identifiers for SHWURX (GTM container, Search Console token,
 * Ads account reference, production hosts). Used for documents that predate
 * Website Center analytics. Activation stays explicit: managed and enabled are
 * false, so nothing loads until an authorised user turns it on and publishes.
 */
export const SEED_ANALYTICS: AnalyticsConfig = {
  ...DEFAULT_ANALYTICS,
  owner: "gtm",
  gtmId: "GTM-P6C37X8X",
  adsCustomerId: "154-133-2403",
  searchConsoleToken: "onMwYj2YCnJTx5G20r0FRfjJwvS6BA_X1qX1fRcaE5I",
  allowedHosts: ["www.swurxauto.com", "swurxauto.com"],
  adsLabels: { ...DEFAULT_ANALYTICS.adsLabels },
  events: { ...DEFAULT_EVENTS },
}

export const ID_RULES = {
  gtmId: { re: /^GTM-[A-Z0-9]{4,12}$/, example: "GTM-ABC1234" },
  ga4Id: { re: /^G-[A-Z0-9]{4,16}$/, example: "G-ABC123XYZ" },
  adsId: { re: /^AW-\d{6,14}$/, example: "AW-123456789" },
  metaPixelId: { re: /^\d{6,20}$/, example: "123456789012345" },
  adsCustomerId: { re: /^\d{3}-\d{3}-\d{4}$/, example: "154-133-2403" },
  searchConsoleToken: { re: /^[A-Za-z0-9_-]{10,100}$/, example: "the content value of the meta tag" },
} as const

const LABEL_RE = /^[A-Za-z0-9_-]{4,64}$/
/** GA4 event-name rules; reserved prefixes are rejected by Google. */
const EVENT_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const RESERVED_EVENT_PREFIX = /^(google_|ga_|firebase_)/i
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

/** Accepts a pasted full <meta> tag or bare token for Search Console. */
export function extractVerificationToken(raw: string): string {
  const s = raw.trim()
  const m = s.match(/content\s*=\s*["']([^"']+)["']/i)
  return (m ? m[1] : s).trim()
}

export function normalizeHost(raw: string): string {
  let s = raw.trim().toLowerCase()
  s = s.replace(/^[a-z]+:\/\//, "").split("/")[0].split("?")[0]
  s = s.replace(/:\d+$/, "").replace(/\.$/, "")
  return s
}

/**
 * Shapes untrusted input into a valid config. Invalid values are dropped and
 * reported through `drops` so a save fails visibly instead of silently
 * persisting a broken ID.
 */
export function sanitizeAnalytics(input: unknown, drops?: string[]): AnalyticsConfig {
  const src = isObj(input) ? input : {}
  // Documents saved before analytics existed start from the verified seed (inactive).
  if (!isObj(input)) return structuredClone(SEED_ANALYTICS)
  const out: AnalyticsConfig = structuredClone(DEFAULT_ANALYTICS)
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  out.managed = src.managed === true
  out.enabled = src.enabled === true
  out.consentRequired = src.consentRequired !== false
  const owner = str(src.owner)
  if (owner === "gtm" || owner === "gtag" || owner === "none") out.owner = owner
  else if (owner) drops?.push(`analytics.owner: "${owner}" is not an allowed value`)

  for (const key of Object.keys(ID_RULES) as (keyof typeof ID_RULES)[]) {
    let v = str(src[key])
    if (key === "searchConsoleToken") v = extractVerificationToken(v)
    else if (key !== "metaPixelId" && key !== "adsCustomerId") v = v.toUpperCase()
    if (!v) continue
    if (ID_RULES[key].re.test(v)) out[key] = v
    else drops?.push(`analytics.${key}: "${v.slice(0, 40)}" is not a valid ID (expected like ${ID_RULES[key].example})`)
  }

  const labels = isObj(src.adsLabels) ? src.adsLabels : {}
  const events = isObj(src.events) ? src.events : {}
  for (const k of CONVERSION_KEYS) {
    const label = str(labels[k])
    if (label) {
      if (LABEL_RE.test(label)) out.adsLabels[k] = label
      else drops?.push(`analytics.adsLabels.${k}: "${label.slice(0, 40)}" is not a valid conversion label`)
    }
    const ev = str(events[k])
    if (ev) {
      if (EVENT_RE.test(ev) && !RESERVED_EVENT_PREFIX.test(ev)) out.events[k] = ev
      else drops?.push(`analytics.events.${k}: "${ev.slice(0, 40)}" is not a valid event name`)
    }
  }

  const days = Number(src.retentionDays)
  if (src.retentionDays !== undefined && src.retentionDays !== "") {
    if (Number.isInteger(days) && days >= 1 && days <= 395) out.retentionDays = days
    else drops?.push(`analytics.retentionDays: must be a whole number of days between 1 and 395`)
  }

  const hosts = Array.isArray(src.allowedHosts) ? src.allowedHosts : []
  const seen = new Set<string>()
  for (const h of hosts.slice(0, 10)) {
    const host = typeof h === "string" ? normalizeHost(h) : ""
    if (!host) continue
    if (!HOST_RE.test(host)) {
      drops?.push(`analytics.allowedHosts: "${host.slice(0, 60)}" is not a valid hostname`)
      continue
    }
    if (!seen.has(host)) out.allowedHosts.push(host)
    seen.add(host)
  }
  return out
}

/** Hostname plus its www/apex twin, e.g. for the canonical site origin. */
export function hostVariants(origin: string): string[] {
  const host = normalizeHost(origin)
  if (!HOST_RE.test(host)) return []
  return host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`]
}

export interface LegacyTrackingSettings {
  tracking_enabled: boolean
  google_site_verification: string | null
  ga4_measurement_id: string | null
  gtm_container_id: string | null
  meta_pixel_id: string | null
}

/**
 * The values the site used before Website Center managed analytics. Used only
 * while `managed` is false so publishing a document cannot silently drop
 * tags that are live today.
 */
export function analyticsFromLegacy(s: LegacyTrackingSettings, siteOrigin: string): AnalyticsConfig {
  const cfg = sanitizeAnalytics({
    managed: false,
    enabled: !!s.tracking_enabled,
    owner: s.gtm_container_id ? "gtm" : s.ga4_measurement_id ? "gtag" : "none",
    gtmId: s.gtm_container_id ?? "",
    ga4Id: s.gtm_container_id ? "" : (s.ga4_measurement_id ?? ""),
    metaPixelId: s.meta_pixel_id ?? "",
    searchConsoleToken: s.google_site_verification ?? "",
    allowedHosts: hostVariants(siteOrigin),
    consentRequired: true,
  })
  return cfg
}

export interface RuntimeTags {
  /** first-party (own database) page/click/lead events */
  firstParty: boolean
  /** at least one third-party tag is loaded */
  thirdParty: boolean
  /** which Google owner sends conversions: GTM dataLayer, direct gtag, or none */
  mode: "gtm" | "ga4" | "none"
  gtmId: string | null
  ga4Id: string | null
  adsId: string | null
  adsLabels: Record<ConversionKey, string>
  events: Record<ConversionKey, string>
  metaPixelId: string | null
  consentRequired: boolean
  retentionDays: number
  verificationToken: string | null
  /** why third-party tags are off, for diagnostics */
  blockedBy: string[]
}

export function resolveRuntime(
  cfg: AnalyticsConfig,
  host: string,
  env: { preview: boolean; indexable: boolean },
): RuntimeTags {
  const blockedBy: string[] = []
  if (!cfg.enabled) blockedBy.push("tracking is switched off")
  if (env.preview) blockedBy.push("editor preview")
  if (!env.indexable) blockedBy.push("not the production deployment")
  const h = normalizeHost(host)
  if (!cfg.allowedHosts.includes(h)) blockedBy.push(`host "${h || "unknown"}" is not in the allowlist`)

  const firstParty = cfg.enabled && !env.preview && env.indexable
  const tagsOn = blockedBy.length === 0
  const gtmId = tagsOn && cfg.owner === "gtm" && cfg.gtmId ? cfg.gtmId : null
  const direct = tagsOn && cfg.owner === "gtag"
  const ga4Id = direct && cfg.ga4Id ? cfg.ga4Id : null
  const adsId = direct && cfg.adsId ? cfg.adsId : null
  const metaPixelId = tagsOn && cfg.metaPixelId ? cfg.metaPixelId : null
  const mode = gtmId ? "gtm" : ga4Id || adsId ? "ga4" : "none"
  return {
    firstParty,
    thirdParty: mode !== "none" || !!metaPixelId,
    mode,
    gtmId,
    ga4Id,
    adsId,
    adsLabels: { ...cfg.adsLabels },
    events: { ...cfg.events },
    metaPixelId,
    consentRequired: cfg.consentRequired,
    retentionDays: cfg.retentionDays,
    verificationToken: cfg.searchConsoleToken || null,
    blockedBy,
  }
}

export interface AnalyticsIssue {
  level: "error" | "warning"
  where: string
  message: string
}

/** Publish-time checks for a coherent single-owner setup. */
export function analyticsIssues(cfg: AnalyticsConfig): AnalyticsIssue[] {
  const issues: AnalyticsIssue[] = []
  const where = "Analytics"
  if (!cfg.managed) return issues
  if (cfg.enabled && cfg.owner === "gtm" && !cfg.gtmId) {
    issues.push({ level: "error", where, message: "Tag owner is Google Tag Manager but no GTM container ID is set." })
  }
  if (cfg.enabled && cfg.owner === "gtag" && !cfg.ga4Id && !cfg.adsId) {
    issues.push({ level: "error", where, message: "Tag owner is direct Google tag but neither a GA4 nor a Google Ads ID is set." })
  }
  if (cfg.owner === "gtm" && (cfg.ga4Id || cfg.adsId)) {
    issues.push({
      level: "warning",
      where,
      message: "GTM owns all Google tags: GA4/Ads IDs here are not loaded directly. Configure them inside the GTM container to avoid double counting.",
    })
  }
  if (cfg.owner === "gtag" && cfg.adsId && !cfg.adsLabels.lead) {
    issues.push({ level: "warning", where, message: "Google Ads ID is set without a lead conversion label; form leads will not count in Ads." })
  }
  if (cfg.owner !== "gtag" && CONVERSION_KEYS.some((k) => cfg.adsLabels[k])) {
    issues.push({ level: "warning", where, message: "Ads conversion labels are only used when the tag owner is direct Google tag." })
  }
  const names = CONVERSION_KEYS.map((k) => cfg.events[k])
  if (new Set(names).size !== names.length) {
    issues.push({ level: "error", where, message: "Lead, appointment, phone-click and WhatsApp-click events must use different event names." })
  }
  if (cfg.enabled && cfg.allowedHosts.length === 0) {
    issues.push({ level: "warning", where, message: "No production hosts are allowed, so no third-party tags will load anywhere." })
  }
  if (cfg.enabled && !cfg.consentRequired) {
    issues.push({ level: "warning", where, message: "Consent is not required: tags load and store identifiers without asking visitors. Confirm this is legally appropriate." })
  }
  if (cfg.enabled && cfg.owner === "none" && !cfg.metaPixelId) {
    issues.push({ level: "warning", where, message: "Tracking is on but no tag owner or pixel is configured; only first-party analytics will run." })
  }
  return issues
}
