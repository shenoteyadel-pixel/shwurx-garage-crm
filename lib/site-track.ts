/**
 * Public-website event bus. One typed envelope for every event, gated by the
 * website master switch (`__shwurxTrack`) and visitor consent.
 *
 *  - First-party events (own database) require analytics consent.
 *  - Google/Meta delivery goes to exactly one configured owner: the GTM
 *    dataLayer (`event: 'shwurx_event'`) or the direct gtag fallback.
 *  - Attribution touches are stored only with advertising consent and expire
 *    after the configured retention window.
 *
 * Payloads never contain names, phones, emails, free text, plates, VINs, raw
 * URLs, customer identifiers or CRM tokens: only controlled enums and slugs.
 */
import { effectiveConsent } from "@/lib/consent"
import { isPublicSitePath } from "@/lib/website/paths"

type ConversionKey = "lead" | "appointment" | "phone_click" | "whatsapp_click"

export interface TagMapping {
  events: Record<ConversionKey, string>
  adsId: string | null
  adsLabels: Record<ConversionKey, string>
  retentionDays?: number
}

declare global {
  interface Window {
    __shwurxTrack?: boolean
    __shwurxThirdParty?: boolean
    __shwurxTagMode?: "gtm" | "ga4" | "none"
    __shwurxTags?: TagMapping
    __shwurxTagsLoaded?: boolean
    /** test/diagnostic trace of what this page queued and dispatched (no PII) */
    __shwurxDelivery?: DeliveryRecord[]
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

const FALLBACK_EVENTS: Record<ConversionKey, string> = {
  lead: "generate_lead",
  appointment: "appointment_request_received",
  phone_click: "phone_click",
  whatsapp_click: "whatsapp_click",
}
const eventName = (k: ConversionKey) => window.__shwurxTags?.events?.[k] || FALLBACK_EVENTS[k]
function adsTarget(k: ConversionKey): string | null {
  const t = window.__shwurxTags
  const label = t?.adsLabels?.[k]
  return t?.adsId && label ? `${t.adsId}/${label}` : null
}

/* ---------------------------------------------------------------- sanitizers */

const TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/
/** Lowercase controlled identifier (slug/enum) or null. */
export function token(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim().toLowerCase()
  return TOKEN_RE.test(s) ? s : null
}

/** Looks like contact data (email, phone run, URL): never forwarded. */
const CONTACT_RE = /@|https?:|www\.|\d[\d\s().-]{6,}\d/i
function campaignValue(v: string | null): string | null {
  if (!v) return null
  const s = v.trim().slice(0, 100)
  if (!s || CONTACT_RE.test(s)) return null
  return s.replace(/[^\p{L}\p{N} _.+:|/-]/gu, "") || null
}
const CLICK_ID_RE = /^[A-Za-z0-9_-]{8,200}$/
const clickId = (v: string | null) => (v && CLICK_ID_RE.test(v) ? v : null)

export interface PageContext {
  page_path: string
  page_type: string
  locale: "en" | "ar"
  brand_slug: string | null
  service_slug: string | null
}

const SECTION_TYPES: Record<string, [index: string, detail: string]> = {
  brands: ["brand_index", "brand_detail"],
  services: ["service_index", "service_detail"],
  blog: ["blog_index", "blog_post"],
}

/** Canonical public context from the path alone; query and hash are dropped. */
export function pageContext(pathname: string): PageContext {
  const clean = pathname.split(/[?#]/)[0] || "/"
  const segs = clean.split("/").filter(Boolean)
  const locale = segs[0] === "ar" ? "ar" : "en"
  if (locale === "ar") segs.shift()
  const safe = segs.map((s) => token(decodeSafe(s)) ?? "_")
  const page_path = "/" + (locale === "ar" ? ["ar", ...safe] : safe).join("/")
  let page_type = "page"
  let brand_slug: string | null = null
  let service_slug: string | null = null
  if (safe.length === 0) page_type = "home"
  else if (SECTION_TYPES[safe[0]]) {
    const [index, detail] = SECTION_TYPES[safe[0]]
    page_type = safe.length > 1 ? detail : index
    if (safe[0] === "brands" && safe[1]) brand_slug = token(safe[1])
    if (safe[0] === "services" && safe[1]) service_slug = token(safe[1])
  } else if (["about", "contact", "privacy", "book"].includes(safe[0])) page_type = safe[0]
  return { page_path: page_path === "/" ? "/" : page_path.replace(/\/$/, ""), page_type, locale, brand_slug, service_slug }
}
function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/* -------------------------------------------------------------- gating */

function siteActive(): boolean {
  return typeof window !== "undefined" && window.__shwurxTrack === true && isPublicSitePath(window.location.pathname)
}
function providersActive(): boolean {
  return siteActive() && window.__shwurxThirdParty === true && (window.__shwurxTagMode ?? "none") !== "none"
}

/* -------------------------------------------------------------- envelope */

export interface EventFields {
  placement?: string | null
  form_key?: string | null
  form_context?: string | null
  interaction_id?: string | null
  destination?: string | null
  platform?: string | null
  error_code?: string | null
  brand_slug?: string | null
  service_slug?: string | null
  conversion_token?: string | null
}

const ENVELOPE_FIELDS = [
  "placement",
  "form_key",
  "form_context",
  "interaction_id",
  "destination",
  "platform",
  "error_code",
] as const

function rid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Every field present, absent ones explicitly null, so GTM never reuses stale values. */
export function envelope(name: string, f: EventFields = {}) {
  const pc = pageContext(window.location.pathname)
  const e: Record<string, string | number | null> = {
    event: "shwurx_event",
    schema_version: 1,
    event_name: name,
    event_id: rid(),
    page_path: pc.page_path,
    page_type: pc.page_type,
    locale: pc.locale,
    brand_slug: token(f.brand_slug) ?? pc.brand_slug,
    service_slug: token(f.service_slug) ?? pc.service_slug,
    conversion_token: f.conversion_token && /^[A-Za-z0-9_-]{16,128}$/.test(f.conversion_token) ? f.conversion_token : null,
  }
  for (const k of ENVELOPE_FIELDS) e[k] = token(f[k])
  return e
}

/** Events the Google owner may receive. Anything else stays first-party. */
const GOOGLE_EVENTS = new Set([
  "page_view",
  "navigation_click",
  "language_change",
  "phone_click",
  "whatsapp_click",
  "directions_click",
  "email_click",
  "social_click",
  "form_start",
  "form_validation_error",
  "form_submit_error",
  "generate_lead",
  "appointment_request_received",
  "faq_expand",
  "gallery_open",
])

/** Sends one envelope to the configured Google owner. Returns true when handed over. */
function pushGoogle(env: Record<string, unknown>, ads?: { sendTo: string; transactionId: string | null }): boolean {
  const mode = window.__shwurxTagMode ?? "none"
  const consent = effectiveConsent()
  if (!consent.analytics && !consent.ads) return false
  if (mode === "gtm" && Array.isArray(window.dataLayer)) {
    // GTM maps the allowlisted event_name; Ads conversions are configured in the container.
    window.dataLayer.push(env)
    return true
  }
  if (mode === "ga4" && typeof window.gtag === "function") {
    const { event: _e, event_name, schema_version: _v, ...params } = env
    if (event_name === "page_view") {
      Object.assign(params, { page_location: window.location.origin + String(env.page_path), page_title: document.title.slice(0, 120) })
    }
    window.gtag("event", String(event_name), params)
    if (ads && consent.ads) {
      window.gtag("event", "conversion", { send_to: ads.sendTo, ...(ads.transactionId ? { transaction_id: ads.transactionId } : {}) })
    }
    return true
  }
  return false
}

/* -------------------------------------------------------------- attribution */

export interface Touch {
  at: string
  landingPath: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
}
/** Kept for callers that predate touch timestamps. */
export type Attribution = Touch
export interface TouchAttribution {
  version: 4
  first: Touch
  latest: Touch
}

export const TOUCH_KEY = "shwurx_touch_v4"
const OLD_TOUCH_KEYS = ["shwurx_touch_first_v3", "shwurx_touch_latest_v3", "shwurx_attr", "shwurx_attribution"]
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

function retentionMs(): number {
  const d = window.__shwurxTags?.retentionDays
  return (Number.isInteger(d) && d! >= 1 && d! <= 395 ? d! : 90) * 86_400_000
}

function externalReferrer(): string | null {
  try {
    if (!document.referrer) return null
    const u = new URL(document.referrer)
    if (u.origin === window.location.origin) return null
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null
  } catch {
    return null
  }
}

function currentTouch(): { touch: Touch; meaningful: boolean } {
  const q = new URLSearchParams(window.location.search)
  const t: Touch = {
    at: new Date().toISOString(),
    landingPath: pageContext(window.location.pathname).page_path,
    referrer: externalReferrer(),
    utm_source: campaignValue(q.get("utm_source")),
    utm_medium: campaignValue(q.get("utm_medium")),
    utm_campaign: campaignValue(q.get("utm_campaign")),
    utm_content: campaignValue(q.get("utm_content")),
    utm_term: campaignValue(q.get("utm_term")),
    gclid: clickId(q.get("gclid")),
    gbraid: clickId(q.get("gbraid")),
    wbraid: clickId(q.get("wbraid")),
  }
  const campaign = UTM.some((k) => t[k]) || !!(t.gclid || t.gbraid || t.wbraid)
  return { touch: t, meaningful: campaign || !!t.referrer }
}

function validTouch(v: unknown): v is Touch {
  return !!v && typeof v === "object" && typeof (v as Touch).at === "string" && !Number.isNaN(Date.parse((v as Touch).at))
}

/** Memory copy: the only store when advertising consent is not granted. */
let memory: TouchAttribution | null = null
/** A page load is one entry; client-side navigations and language switches are not. */
let entryEvaluated = false

/** Tests: simulate a fresh document load. */
export function beginPageLoad() {
  entryEvaluated = false
  memory = null
}

function readStored(): TouchAttribution | null {
  try {
    const raw = window.localStorage.getItem(TOUCH_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<TouchAttribution>
    if (s.version !== 4 || !validTouch(s.first) || !validTouch(s.latest)) return null
    const now = Date.now()
    const keep = retentionMs()
    // Expired touches are removed, never silently merged into a newer one.
    if (now - Date.parse(s.first.at) > keep) {
      window.localStorage.removeItem(TOUCH_KEY)
      return null
    }
    return s as TouchAttribution
  } catch {
    return null
  }
}

function persist(a: TouchAttribution) {
  memory = a
  if (!effectiveConsent().ads) return
  try {
    window.localStorage.setItem(TOUCH_KEY, JSON.stringify(a))
  } catch {
    /* storage blocked: memory only */
  }
}

function dropLegacyKeys() {
  for (const k of OLD_TOUCH_KEYS) {
    try {
      window.localStorage.removeItem(k)
      window.sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Records this page load's entry. First touch is immutable within retention;
 * latest moves only on a new external or campaign entry. Old unversioned
 * values are discarded (they had no timestamp to prove they are in retention).
 */
export function captureAttribution(): TouchAttribution {
  const stored = memory ?? readStored()
  if (entryEvaluated && stored) return stored
  const firstEval = !entryEvaluated
  entryEvaluated = true
  dropLegacyKeys()
  const { touch, meaningful } = currentTouch()
  let next: TouchAttribution
  if (!stored) next = { version: 4, first: touch, latest: touch }
  else if (firstEval && meaningful) next = { version: 4, first: stored.first, latest: touch }
  else next = stored
  persist(next)
  return next
}

export function getAttribution(): TouchAttribution {
  return memory ?? readStored() ?? captureAttribution()
}

/** Called when advertising consent is granted mid-visit, so the entry is kept. */
export function persistAttributionAfterConsent() {
  if (memory) persist(memory)
}

/* -------------------------------------------------------------- first-party */

function device(): string {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/tablet|ipad/i.test(ua)) return "tablet"
  if (/mobi|android|iphone/i.test(ua)) return "mobile"
  return "desktop"
}

function sessionId(): string {
  try {
    let id = window.sessionStorage.getItem("shwurx_sid")
    if (!id) {
      id = rid()
      window.sessionStorage.setItem("shwurx_sid", id)
    }
    return id
  } catch {
    return "nostore"
  }
}

function sendFirstParty(name: string, env: Record<string, unknown>) {
  if (!effectiveConsent().analytics) return
  const attr = getAttribution().latest
  const pc = pageContext(window.location.pathname)
  const metadata: Record<string, unknown> = {}
  for (const k of ["placement", "form_key", "form_context", "destination", "platform", "error_code", "brand_slug", "service_slug", "locale", "page_type"]) {
    if (env[k] !== null && env[k] !== undefined) metadata[k] = env[k]
  }
  const body = JSON.stringify({
    eventType: name,
    sessionId: sessionId(),
    pagePath: pc.page_path,
    referrer: attr.referrer,
    source: attr.utm_source,
    medium: attr.utm_medium,
    campaign: attr.utm_campaign,
    device: device(),
    metadata,
  })
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/public/track", new Blob([body], { type: "application/json" }))
  } else {
    void fetch("/api/public/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
  }
}

/**
 * One event to both sinks. Silently does nothing when the site is switched off,
 * previewed or on a non-public route. Legacy metadata keys are mapped onto
 * controlled envelope fields; anything else is dropped.
 */
export function track(eventType: string, metadata: Record<string, unknown> = {}) {
  try {
    if (!siteActive()) return
    const name = token(eventType)?.replace(/-/g, "_")
    if (!name) return
    const fields: EventFields = {
      placement: (metadata.placement ?? metadata.location ?? metadata.context) as string | null,
      form_key: (metadata.form_key ?? metadata.form) as string | null,
      form_context: metadata.form_context as string | null,
      interaction_id: metadata.interaction_id as string | null,
      destination: (metadata.destination ?? metadata.target) as string | null,
      platform: metadata.platform as string | null,
      error_code: metadata.error_code as string | null,
      brand_slug: (metadata.brand_slug ?? metadata.brand) as string | null,
      service_slug: (metadata.service_slug ?? metadata.service) as string | null,
    }
    const env = envelope(name, fields)
    sendFirstParty(name, env)
    if (providersActive() && GOOGLE_EVENTS.has(name)) {
      if (!pushGoogle(env)) queueUntilReady(env)
    }
  } catch {
    /* tracking is best-effort */
  }
}

/** Non-conversion events wait briefly for the owner tag, then are dropped. */
function queueUntilReady(env: Record<string, unknown>, attempt = 0) {
  if (attempt >= 10) return
  window.setTimeout(() => {
    if (!providersActive()) return
    if (!pushGoogle(env)) queueUntilReady(env, attempt + 1)
  }, 500)
}

export function emitClick(kind: "phone_click" | "whatsapp_click", placement: string, extra: EventFields = {}) {
  try {
    if (!siteActive()) return
    const env = envelope(eventName(kind), { ...extra, placement })
    sendFirstParty(kind, env)
    if (!providersActive()) return
    const sendTo = adsTarget(kind)
    const ads = sendTo ? { sendTo, transactionId: null } : undefined
    if (!pushGoogle(env, ads)) queueUntilReady(env)
  } catch {
    /* best-effort */
  }
}

/* -------------------------------------------------------------- conversions */

export type DeliveryState = "queued" | "dispatched" | "skipped" | "abandoned"
export interface DeliveryRecord {
  key: string
  outcome: "lead" | "appointment"
  state: DeliveryState
  at: string
  reason?: string
}

function record(key: string, outcome: "lead" | "appointment", state: DeliveryState, reason?: string) {
  const log = (window.__shwurxDelivery ??= [])
  log.push({ key, outcome, state, at: new Date().toISOString(), ...(reason ? { reason } : {}) })
  if (log.length > 50) log.splice(0, log.length - 50)
}

const MARKER_TTL_MS = 400 * 86_400_000
function markerKey(outcome: "lead" | "appointment", id: string) {
  return `shwurx_conv4_${outcome}_${id}`
}
function hasMarker(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return false
    const at = Number(raw)
    if (Number.isFinite(at) && Date.now() - at > MARKER_TTL_MS) {
      window.localStorage.removeItem(key)
      return false
    }
    return true
  } catch {
    return false
  }
}
function setMarker(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {
    /* a later retry may dispatch again; Ads dedupes on transaction_id */
  }
}

/** Conversions waiting for a provider to become ready, keyed by outcome + record id. */
const inFlight = new Map<string, number>()

/** Cancels queued conversions (consent withdrawn, switch off, private route). */
export function cancelPendingConversions(reason: string) {
  for (const [key, timer] of inFlight) {
    window.clearTimeout(timer)
    record(key, key.includes("_appointment_") ? "appointment" : "lead", "abandoned", reason)
  }
  inFlight.clear()
}

export interface ConversionContext {
  form: string
  formContext?: string | null
  brand?: string | null
  service?: string | null
  /** opaque server-issued token; used as the Ads transaction_id */
  token?: string | null
  outcome?: "lead" | "appointment"
}

/**
 * Conversion for a VERIFIED persisted record. Keyed by outcome + durable record
 * id, so a lost response followed by a retry that returns "duplicate" with the
 * same id and token counts exactly once.
 */
export function emitConversion(recordId: string, ctx: ConversionContext) {
  try {
    if (!recordId || !siteActive()) return
    const outcome = ctx.outcome ?? "lead"
    const fpKey = `shwurx_conv1_${outcome}_${recordId}`
    if (!hasMarker(fpKey)) {
      const env = envelope(eventName(outcome), {
        form_key: ctx.form,
        form_context: ctx.formContext,
        brand_slug: ctx.brand,
        service_slug: ctx.service,
      })
      sendFirstParty(outcome === "lead" ? "enquiry_persisted" : "appointment_persisted", env)
      setMarker(fpKey)
    }
    if (!providersActive()) return
    const key = markerKey(outcome, recordId)
    if (hasMarker(key) || inFlight.has(key)) return
    record(key, outcome, "queued")
    inFlight.set(key, 0)
    dispatch(key, outcome, ctx, 0)
  } catch {
    /* best-effort */
  }
}

/**
 * Hands the conversion to the single configured owner. Every attempt rechecks
 * the durable marker and eligibility, so a parallel caller or another tab that
 * already sent it wins. "dispatched" means handed to the tag — not that Google
 * received or counted it.
 */
function dispatch(key: string, outcome: "lead" | "appointment", ctx: ConversionContext, attempt: number) {
  if (!inFlight.has(key)) return
  if (hasMarker(key)) {
    inFlight.delete(key)
    record(key, outcome, "skipped", "already_sent")
    return
  }
  if (!providersActive()) {
    inFlight.delete(key)
    record(key, outcome, "abandoned", "ineligible")
    return
  }
  const env = envelope(eventName(outcome), {
    form_key: ctx.form,
    form_context: ctx.formContext,
    brand_slug: ctx.brand,
    service_slug: ctx.service,
    conversion_token: ctx.token ?? null,
  })
  const sendTo = adsTarget(outcome)
  const ads = sendTo ? { sendTo, transactionId: env.conversion_token as string | null } : undefined
  if (pushGoogle(env, ads)) {
    setMarker(key)
    inFlight.delete(key)
    record(key, outcome, "dispatched")
    return
  }
  if (attempt < 20) {
    inFlight.set(key, window.setTimeout(() => dispatch(key, outcome, ctx, attempt + 1), 500))
    return
  }
  inFlight.delete(key)
  record(key, outcome, "abandoned", "provider_not_ready")
}

/* -------------------------------------------------------------- intake */

export type IntakeResult =
  | { outcome: "received" | "duplicate"; id: string; conversionToken: string | null }
  | { outcome: "dry_run"; id: null; conversionToken: null }

async function postJson(url: string, payload: Record<string, unknown>): Promise<IntakeResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({ ok: false }))) as {
    ok?: boolean
    outcome?: string
    id?: unknown
    conversionToken?: unknown
    error?: string
  }
  if (res.ok && json.outcome === "dry_run") return { outcome: "dry_run", id: null, conversionToken: null }
  if (res.ok && (json.outcome === "received" || json.outcome === "duplicate") && typeof json.id === "string" && json.id) {
    return {
      outcome: json.outcome,
      id: json.id,
      conversionToken: typeof json.conversionToken === "string" ? json.conversionToken : null,
    }
  }
  throw new Error(json.error || "Something went wrong. Please try again.")
}

export function submitAppointment(payload: Record<string, unknown>) {
  return postJson("/api/public/appointments", payload)
}

export function submitLead(payload: Record<string, unknown>) {
  return postJson("/api/public/leads", payload)
}
