import type { CampaignRow, CheckStatus, LiveResult, PlatformPerformance, ProposedAction } from "@/lib/ai-marketing/types"
import { sumTotals } from "@/lib/ai-marketing/meta"

/**
 * Server-only Google Ads API (REST) client using an OAuth refresh token.
 * Access tokens are refreshed automatically and kept only in memory.
 * This does not touch the existing Google Ads lead-form webhook.
 */
const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23"
const BASE = `https://googleads.googleapis.com/${VERSION}`
const REQUIRED_ENV = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
] as const

export function googleMissingEnv(): string[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]?.trim())
}

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "")
export const googleCustomerId = () => digits(process.env.GOOGLE_ADS_CUSTOMER_ID)

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error === "invalid_grant"
        ? "Google refresh token is expired or revoked — re-authorize the Google Ads account."
        : `Google OAuth failed: ${json.error_description ?? json.error ?? res.status}`,
    )
  }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function gads<T>(path: string, body?: unknown, method: "GET" | "POST" = body ? "POST" : "GET"): Promise<T> {
  const token = await accessToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  }
  const login = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
  if (login) headers["login-customer-id"] = login
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new Error("Could not reach googleads.googleapis.com")
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] }
  } & T
  if (!res.ok || json.error) {
    const inner = json.error?.details?.[0]?.errors?.[0]
    const code = inner?.errorCode ? Object.values(inner.errorCode)[0] : json.error?.status
    const hint =
      code === "DEVELOPER_TOKEN_NOT_APPROVED"
        ? " (developer token only has test-account access — apply for Basic access)"
        : code === "UNSUPPORTED_VERSION"
          ? ` (set GOOGLE_ADS_API_VERSION to a supported version; current: ${VERSION})`
          : code === "RESOURCE_EXHAUSTED"
            ? " (rate limit — try again later)"
            : ""
    throw new Error(`${inner?.message ?? json.error?.message ?? `HTTP ${res.status}`}${code ? ` [${code}]` : ""}${hint}`)
  }
  return json
}

async function search<T>(query: string): Promise<T[]> {
  const out = await gads<{ results?: T[] }>(`customers/${googleCustomerId()}/googleAds:search`, { query })
  return out.results ?? []
}

export interface GoogleCheck {
  status: CheckStatus
  summary: string
  canRead: boolean
  canManage: boolean
  details: Record<string, unknown>
}

export async function checkGoogle(): Promise<GoogleCheck> {
  const missing = googleMissingEnv()
  if (missing.length) {
    return {
      status: "not_configured",
      summary: `Missing environment variables: ${missing.join(", ")}`,
      canRead: false,
      canManage: false,
      details: { missing },
    }
  }
  try {
    const accessible = await gads<{ resourceNames?: string[] }>("customers:listAccessibleCustomers")
    const [row] = await search<{ customer: { id: string; descriptiveName?: string; currencyCode?: string; status?: string; testAccount?: boolean } }>(
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status, customer.test_account FROM customer LIMIT 1",
    )
    const enabled = row?.customer.status === "ENABLED"
    const details = {
      apiVersion: VERSION,
      accessibleCustomers: (accessible.resourceNames ?? []).map((r) => r.replace("customers/", "")),
      configuredCustomer: googleCustomerId(),
      customerName: row?.customer.descriptiveName ?? null,
      currency: row?.customer.currencyCode ?? null,
      customerStatus: row?.customer.status ?? "unknown",
      testAccount: row?.customer.testAccount ?? null,
      canRead: enabled,
      // OAuth scope "adwords" grants both read and write; account must be enabled.
      canManage: enabled,
    }
    if (!enabled) {
      return { status: "limited", summary: `Authenticated, but customer ${googleCustomerId()} is ${details.customerStatus}.`, canRead: false, canManage: false, details }
    }
    return {
      status: "connected",
      summary: `Connected to ${details.customerName ?? googleCustomerId()} (${details.currency}).`,
      canRead: true,
      canManage: true,
      details,
    }
  } catch (e) {
    return {
      status: "error",
      summary: e instanceof Error ? e.message : "Google Ads request failed",
      canRead: false,
      canManage: false,
      details: { apiVersion: VERSION },
    }
  }
}

type CampaignResult = {
  campaign: { id: string; name: string; status: string; advertisingChannelType?: string }
  campaignBudget?: { amountMicros?: string }
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number }
}

export async function getGooglePerformance(): Promise<LiveResult<PlatformPerformance>> {
  const missing = googleMissingEnv()
  if (missing.length) return { state: "not_configured", missing }
  try {
    const [rows, [cust]] = await Promise.all([
      search<CampaignResult>(
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'",
      ),
      search<{ customer: { currencyCode?: string } }>("SELECT customer.currency_code FROM customer LIMIT 1"),
    ])
    const campaigns: CampaignRow[] = rows.map((r) => ({
      id: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status,
      objective: r.campaign.advertisingChannelType ?? null,
      dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null,
      spend: Number(r.metrics?.costMicros ?? 0) / 1e6,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      leads: Math.round(Number(r.metrics?.conversions ?? 0)),
    }))
    return {
      state: "ok",
      data: {
        platform: "google",
        accountId: googleCustomerId(),
        currency: cust?.customer.currencyCode ?? "AED",
        rangeLabel: "last_30d",
        campaigns: campaigns.sort((a, b) => b.spend - a.spend),
        totals: sumTotals(campaigns),
        adSetCount: null,
        adCount: null,
      },
    }
  } catch (e) {
    return { state: "error", error: e instanceof Error ? e.message : "Google Ads request failed" }
  }
}

export async function googleSnapshot(campaignId: string) {
  const id = digits(campaignId)
  const [row] = await search<{ campaign: { id: string; name: string; status: string; campaignBudget?: string }; campaignBudget?: { amountMicros?: string } }>(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${id}`,
  )
  if (!row) throw new Error(`Campaign ${id} not found`)
  return row
}

/** Executes ONE approved action. New campaigns are always created PAUSED. */
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
