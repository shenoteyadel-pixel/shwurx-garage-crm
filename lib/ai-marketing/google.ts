import type { CampaignRow, CheckStatus, LiveResult, PlatformPerformance, ProposedAction } from "@/lib/ai-marketing/types"
import { sumTotals } from "@/lib/ai-marketing/meta"
import { resolveRefreshToken, type RefreshTokenSource, type StoredAuthorization } from "@/lib/ai-marketing/google-token"

/**
 * Server-only Google Ads API (REST) client. Access tokens are minted from the
 * OAuth refresh token and kept only in memory. Credentials never reach the browser.
 * This does not touch the existing Google Ads lead-form webhook.
 */
export const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23"
const BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords"

const STATIC_ENV = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_CUSTOMER_ID",
] as const
export const REFRESH_TOKEN_LABEL = "GOOGLE_ADS_REFRESH_TOKEN (or authorize with Google)"

const has = (k: string) => Boolean(process.env[k]?.trim())
const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "")
export const googleCustomerId = () => digits(process.env.GOOGLE_ADS_CUSTOMER_ID)
export const googleLoginCustomerId = () => digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
export const formatCustomerId = (id: string) => (id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id)

/** Static env vars that are missing (synchronous; excludes the refresh token). */
export function googleMissingEnv(): string[] {
  return STATIC_ENV.filter((k) => !has(k))
}

/** Everything missing for a live call, including an OAuth refresh token from env or the in-app flow. */
export async function googleMissing(): Promise<string[]> {
  const missing = googleMissingEnv()
  const { token } = await resolveRefreshToken()
  if (!token) missing.push(REFRESH_TOKEN_LABEL)
  return missing
}

export interface GoogleConfigStatus {
  credentials: { key: string; configured: boolean }[]
  refreshSource: RefreshTokenSource
  oauth: StoredAuthorization | null
  loginCustomerId: string | null
  customerId: string | null
  apiVersion: string
  oauthClientReady: boolean
}

/** Which credentials exist — never their values. */
export async function getGoogleConfigStatus(): Promise<GoogleConfigStatus> {
  const refresh = await resolveRefreshToken()
  return {
    credentials: [
      ...STATIC_ENV.map((key) => ({ key, configured: has(key) })),
      { key: "GOOGLE_ADS_REFRESH_TOKEN", configured: Boolean(refresh.token) },
    ],
    refreshSource: refresh.source,
    oauth: refresh.stored,
    loginCustomerId: googleLoginCustomerId() ? formatCustomerId(googleLoginCustomerId()) : null,
    customerId: googleCustomerId() ? formatCustomerId(googleCustomerId()) : null,
    apiVersion: GOOGLE_ADS_API_VERSION,
    oauthClientReady: has("GOOGLE_ADS_CLIENT_ID") && has("GOOGLE_ADS_CLIENT_SECRET"),
  }
}

/* ---------------- Errors ---------------- */
export type GoogleErrorCategory =
  | "auth_expired"
  | "auth_invalid"
  | "permission"
  | "developer_token"
  | "rate_limit"
  | "version"
  | "network"
  | "not_found"
  | "unknown"

const CATEGORY_OF: Record<string, GoogleErrorCategory> = {
  INVALID_GRANT: "auth_expired",
  OAUTH_TOKEN_EXPIRED: "auth_expired",
  OAUTH_TOKEN_REVOKED: "auth_expired",
  OAUTH_TOKEN_INVALID: "auth_invalid",
  INVALID_CLIENT: "auth_invalid",
  UNAUTHENTICATED: "auth_invalid",
  NOT_ADS_USER: "permission",
  USER_PERMISSION_DENIED: "permission",
  CUSTOMER_NOT_ENABLED: "permission",
  ACTION_NOT_PERMITTED: "permission",
  PERMISSION_DENIED: "permission",
  DEVELOPER_TOKEN_NOT_APPROVED: "developer_token",
  DEVELOPER_TOKEN_PROHIBITED: "developer_token",
  DEVELOPER_TOKEN_INVALID: "developer_token",
  DEVELOPER_TOKEN_PARAMETER_MISSING: "developer_token",
  RESOURCE_EXHAUSTED: "rate_limit",
  RESOURCE_TEMPORARILY_EXHAUSTED: "rate_limit",
  UNSUPPORTED_VERSION: "version",
  CUSTOMER_NOT_FOUND: "not_found",
  NETWORK: "network",
}

export const GOOGLE_ERROR_HINTS: Record<GoogleErrorCategory, string> = {
  auth_expired: "The refresh token is expired or was revoked. Re-authorize with Google on this page.",
  auth_invalid: "OAuth client ID/secret or token is invalid. Check GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET.",
  permission:
    "The authorized Google user cannot access this account. Sign in with a user that has access to MCC 182-609-1325, and check GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
  developer_token:
    "The developer token is invalid or only approved for test accounts. Apply for Basic access in the MCC's API Center.",
  rate_limit: "Google Ads API rate limit reached. Wait a few minutes and retry.",
  version: `API version ${GOOGLE_ADS_API_VERSION} is not supported. Set GOOGLE_ADS_API_VERSION to a current version.`,
  network: "Could not reach googleads.googleapis.com. Retry shortly.",
  not_found: "Customer ID not found. Check GOOGLE_ADS_CUSTOMER_ID (10 digits, no dashes needed).",
  unknown: "Unexpected Google Ads API error. See the message for details.",
}

export class GoogleAdsError extends Error {
  code: string | null
  category: GoogleErrorCategory
  constructor(message: string, code: string | null) {
    const category = (code && CATEGORY_OF[code]) || "unknown"
    super(message)
    this.code = code
    this.category = category
  }
}

export function describeGoogleError(e: unknown) {
  if (e instanceof GoogleAdsError) return { message: e.message, code: e.code, category: e.category, hint: GOOGLE_ERROR_HINTS[e.category] }
  const message = e instanceof Error ? e.message : "Google Ads request failed"
  return { message, code: null, category: "unknown" as const, hint: GOOGLE_ERROR_HINTS.unknown }
}

/* ---------------- Transport ---------------- */
let cachedToken: { value: string; expiresAt: number; refresh: string } | null = null

async function accessToken(): Promise<string> {
  const { token: refresh } = await resolveRefreshToken()
  if (!refresh) throw new GoogleAdsError("No Google refresh token — authorize with Google first.", "INVALID_GRANT")
  if (cachedToken && cachedToken.refresh === refresh && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  let res: Response
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
        refresh_token: refresh,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new GoogleAdsError("Could not reach oauth2.googleapis.com", "NETWORK")
  }
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    cachedToken = null
    const code = json.error === "invalid_grant" ? "INVALID_GRANT" : json.error === "invalid_client" ? "INVALID_CLIENT" : null
    throw new GoogleAdsError(`Google OAuth failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`, code)
  }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, refresh }
  return cachedToken.value
}

async function gads<T>(path: string, body?: unknown, method: "GET" | "POST" = body ? "POST" : "GET"): Promise<T> {
  const token = await accessToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  }
  const login = googleLoginCustomerId()
  if (login) headers["login-customer-id"] = login
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    throw new GoogleAdsError("Could not reach googleads.googleapis.com", "NETWORK")
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] }
  } & T
  if (!res.ok || json.error) {
    const inner = json.error?.details?.[0]?.errors?.[0]
    const code = inner?.errorCode ? Object.values(inner.errorCode)[0] : (json.error?.status ?? (res.status === 429 ? "RESOURCE_EXHAUSTED" : null))
    throw new GoogleAdsError(`${inner?.message ?? json.error?.message ?? `HTTP ${res.status}`}${code ? ` [${code}]` : ""}`, code ?? null)
  }
  return json
}

async function search<T>(query: string): Promise<T[]> {
  const out = await gads<{ results?: T[] }>(`customers/${googleCustomerId()}/googleAds:search`, { query })
  return out.results ?? []
}

/* ---------------- Connection check ---------------- */
export interface GoogleCheck {
  status: CheckStatus
  summary: string
  canRead: boolean
  canManage: boolean
  details: Record<string, unknown>
}

export async function checkGoogle(): Promise<GoogleCheck> {
  const missing = await googleMissing()
  if (missing.length) {
    return {
      status: "not_configured",
      summary: `Missing: ${missing.join(", ")}`,
      canRead: false,
      canManage: false,
      details: { missing },
    }
  }
  const started = Date.now()
  try {
    const accessible = await gads<{ resourceNames?: string[] }>("customers:listAccessibleCustomers")
    const [row] = await search<{
      customer: { id: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; status?: string; testAccount?: boolean; manager?: boolean }
    }>(
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.test_account, customer.manager FROM customer LIMIT 1",
    )
    const enabled = row?.customer.status === "ENABLED"
    const details = {
      apiVersion: GOOGLE_ADS_API_VERSION,
      latencyMs: Date.now() - started,
      accessibleCustomers: (accessible.resourceNames ?? []).map((r) => formatCustomerId(r.replace("customers/", ""))),
      loginCustomer: formatCustomerId(googleLoginCustomerId()),
      configuredCustomer: formatCustomerId(googleCustomerId()),
      customerName: row?.customer.descriptiveName ?? null,
      currency: row?.customer.currencyCode ?? null,
      timeZone: row?.customer.timeZone ?? null,
      customerStatus: row?.customer.status ?? "unknown",
      testAccount: row?.customer.testAccount ?? null,
      canRead: enabled,
      canManage: enabled,
    }
    if (!row) {
      return { status: "error", summary: "Authenticated, but Google Ads returned no customer data.", canRead: false, canManage: false, details }
    }
    if (!enabled) {
      return {
        status: "limited",
        summary: `Authenticated, but customer ${details.configuredCustomer} is ${details.customerStatus}.`,
        canRead: false,
        canManage: false,
        details,
      }
    }
    return {
      status: "connected",
      summary: `Connected to ${details.customerName ?? details.configuredCustomer} (${details.currency}, ${details.timeZone}).`,
      canRead: true,
      canManage: true,
      details,
    }
  } catch (e) {
    const err = describeGoogleError(e)
    return {
      status: "error",
      summary: err.message,
      canRead: false,
      canManage: false,
      details: { apiVersion: GOOGLE_ADS_API_VERSION, errorCode: err.code, errorCategory: err.category, hint: err.hint },
    }
  }
}

/* ---------------- Reporting ---------------- */
type Metrics = { impressions?: string; clicks?: string; costMicros?: string; conversions?: number; conversionsValue?: number }
const m = (x?: Metrics) => ({
  impressions: Number(x?.impressions ?? 0),
  clicks: Number(x?.clicks ?? 0),
  cost: Number(x?.costMicros ?? 0) / 1e6,
  conversions: Number(x?.conversions ?? 0),
  conversionsValue: Number(x?.conversionsValue ?? 0),
})
const div = (a: number, b: number) => (b > 0 ? a / b : null)

export interface GoogleMetrics {
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionsValue: number
  ctr: number | null
  avgCpc: number | null
  convRate: number | null
  costPerConv: number | null
}
const derive = (x: ReturnType<typeof m>): GoogleMetrics => ({
  ...x,
  ctr: div(x.clicks, x.impressions),
  avgCpc: div(x.cost, x.clicks),
  convRate: div(x.conversions, x.clicks),
  costPerConv: div(x.cost, x.conversions),
})

export interface GoogleCampaign extends GoogleMetrics {
  id: string
  name: string
  status: string
  channel: string | null
  dailyBudget: number | null
}

export interface GoogleDashboard {
  customer: { id: string; name: string | null; currency: string; timeZone: string | null }
  range: { from: string; to: string }
  totals: GoogleMetrics
  campaigns: GoogleCampaign[]
  daily: { date: string; cost: number; impressions: number; clicks: number; conversions: number }[]
  keywords: (GoogleMetrics & { campaign: string; adGroup: string; text: string; matchType: string; status: string; qualityScore: number | null })[]
  searchTerms: (GoogleMetrics & { term: string; campaign: string; status: string })[]
  notes: string[]
  fetchedAt: string
}

function dubaiDate(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" })
}

/** Full read-only dashboard: 30-day campaign metrics, 90-day daily trend, keywords and search terms. */
export async function getGoogleDashboard(): Promise<LiveResult<GoogleDashboard>> {
  const missing = await googleMissing()
  if (missing.length) return { state: "not_configured", missing }
  const from30 = dubaiDate(-30)
  const from90 = dubaiDate(-90)
  const to = dubaiDate(-1)
  const notes: string[] = []
  try {
    const [[cust], allCampaigns, campaignMetrics, dailyRows] = await Promise.all([
      search<{ customer: { id: string; descriptiveName?: string; currencyCode?: string; timeZone?: string } }>(
        "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      ),
      search<{ campaign: { id: string; name: string; status: string; advertisingChannelType?: string }; campaignBudget?: { amountMicros?: string } }>(
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign",
      ),
      search<{ campaign: { id: string }; metrics?: Metrics }>(
        `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from30}' AND '${to}'`,
      ),
      search<{ segments: { date: string }; metrics?: Metrics }>(
        `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date BETWEEN '${from90}' AND '${to}' ORDER BY segments.date`,
      ),
    ])

    const metricsById = new Map(campaignMetrics.map((r) => [r.campaign.id, m(r.metrics)]))
    const campaigns: GoogleCampaign[] = allCampaigns.map((r) => ({
      id: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status,
      channel: r.campaign.advertisingChannelType ?? null,
      dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null,
      ...derive(metricsById.get(r.campaign.id) ?? m()),
    }))
    const sum = campaigns.reduce(
      (a, c) => ({
        impressions: a.impressions + c.impressions,
        clicks: a.clicks + c.clicks,
        cost: a.cost + c.cost,
        conversions: a.conversions + c.conversions,
        conversionsValue: a.conversionsValue + c.conversionsValue,
      }),
      m(),
    )

    const [keywords, searchTerms] = await Promise.all([
      search<{
        campaign: { name: string }
        adGroup: { name: string }
        adGroupCriterion: { status: string; keyword?: { text?: string; matchType?: string }; qualityInfo?: { qualityScore?: number } }
        metrics?: Metrics
      }>(
        `SELECT campaign.name, ad_group.name, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '${from30}' AND '${to}' ORDER BY metrics.cost_micros DESC LIMIT 50`,
      ).catch((e) => {
        notes.push(`Keywords unavailable: ${describeGoogleError(e).message}`)
        return []
      }),
      search<{ searchTermView: { searchTerm: string; status: string }; campaign: { name: string }; metrics?: Metrics }>(
        `SELECT search_term_view.search_term, search_term_view.status, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${from30}' AND '${to}' ORDER BY metrics.cost_micros DESC LIMIT 50`,
      ).catch((e) => {
        notes.push(`Search terms unavailable: ${describeGoogleError(e).message}`)
        return []
      }),
    ])

    return {
      state: "ok",
      data: {
        customer: {
          id: formatCustomerId(googleCustomerId()),
          name: cust?.customer.descriptiveName ?? null,
          currency: cust?.customer.currencyCode ?? "AED",
          timeZone: cust?.customer.timeZone ?? null,
        },
        range: { from: from30, to },
        totals: derive(sum),
        campaigns: campaigns.sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name)),
        daily: dailyRows.map((r) => {
          const x = m(r.metrics)
          return { date: r.segments.date, cost: x.cost, impressions: x.impressions, clicks: x.clicks, conversions: x.conversions }
        }),
        keywords: keywords.map((k) => ({
          campaign: k.campaign.name,
          adGroup: k.adGroup.name,
          text: k.adGroupCriterion.keyword?.text ?? "",
          matchType: k.adGroupCriterion.keyword?.matchType ?? "",
          status: k.adGroupCriterion.status,
          qualityScore: k.adGroupCriterion.qualityInfo?.qualityScore ?? null,
          ...derive(m(k.metrics)),
        })),
        searchTerms: searchTerms.map((t) => ({
          term: t.searchTermView.searchTerm,
          status: t.searchTermView.status,
          campaign: t.campaign.name,
          ...derive(m(t.metrics)),
        })),
        notes,
        fetchedAt: new Date().toISOString(),
      },
    }
  } catch (e) {
    const err = describeGoogleError(e)
    return { state: "error", error: `${err.message} — ${err.hint}` }
  }
}

/** Compact 30-day campaign summary in the shared cross-platform shape (used by the agent and attribution). */
export function toPlatformPerformance(d: GoogleDashboard): PlatformPerformance {
  const campaigns: CampaignRow[] = d.campaigns
    .filter((c) => c.status !== "REMOVED" || c.cost > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.channel,
      dailyBudget: c.dailyBudget,
      spend: c.cost,
      impressions: c.impressions,
      clicks: c.clicks,
      leads: Math.round(c.conversions),
    }))
  return {
    platform: "google",
    accountId: d.customer.id,
    currency: d.customer.currency,
    rangeLabel: "last_30d",
    campaigns,
    totals: sumTotals(campaigns),
    adSetCount: null,
    adCount: null,
  }
}

export async function getGooglePerformance(): Promise<LiveResult<PlatformPerformance>> {
  const r = await getGoogleDashboard()
  return r.state === "ok" ? { state: "ok", data: toPlatformPerformance(r.data) } : r
}

/* ---------------- Approved actions (gated; read-only by default) ---------------- */
export async function googleSnapshot(campaignId: string) {
  const id = digits(campaignId)
  const [row] = await search<{ campaign: { id: string; name: string; status: string; campaignBudget?: string }; campaignBudget?: { amountMicros?: string } }>(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${id}`,
  )
  if (!row) throw new Error(`Campaign ${id} not found`)
  return row
}

/**
 * Executes ONE owner-approved action. Only reachable through executeApprovedRecommendation,
 * which requires the server env switch, the per-platform publishing switch and a typed
 * confirmation. New campaigns are always created PAUSED.
 */
export async function executeGoogleAction(action: ProposedAction, idempotencyKey: string): Promise<Record<string, unknown>> {
  const cid = googleCustomerId()
  if (action.kind === "create_campaign") {
    if (!action.name || !action.daily_budget_aed || action.daily_budget_aed <= 0) {
      throw new Error("Campaign name and a positive daily budget are required")
    }
    const budget = await gads<{ results: { resourceName: string }[] }>(`customers/${cid}/campaignBudgets:mutate`, {
      operations: [
        {
          create: {
            name: `${action.name} budget ${idempotencyKey.slice(-8)}`,
            amountMicros: String(Math.round(action.daily_budget_aed * 1e6)),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      ],
    })
    return gads(`customers/${cid}/campaigns:mutate`, {
      operations: [
        {
          create: {
            name: action.name,
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
            campaignBudget: budget.results[0].resourceName,
            manualCpc: {},
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
          },
        },
      ],
    })
  }
  if (!action.campaign_id) throw new Error("campaign_id is required")
  const snap = await googleSnapshot(action.campaign_id)
  if (action.kind === "update_budget") {
    if (!action.daily_budget_aed || action.daily_budget_aed <= 0) throw new Error("A positive budget is required")
    if (!snap.campaign.campaignBudget) throw new Error("Campaign has no budget resource")
    return gads(`customers/${cid}/campaignBudgets:mutate`, {
      operations: [
        {
          update: { resourceName: snap.campaign.campaignBudget, amountMicros: String(Math.round(action.daily_budget_aed * 1e6)) },
          updateMask: "amount_micros",
        },
      ],
    })
  }
  if (action.kind === "set_status") {
    const status = action.status === "ACTIVE" ? "ENABLED" : action.status === "PAUSED" ? "PAUSED" : null
    if (!status) throw new Error("Status must be PAUSED or ACTIVE")
    return gads(`customers/${cid}/campaigns:mutate`, {
      operations: [{ update: { resourceName: `customers/${cid}/campaigns/${digits(action.campaign_id)}`, status }, updateMask: "status" }],
    })
  }
  throw new Error("This recommendation has no executable action")
}
