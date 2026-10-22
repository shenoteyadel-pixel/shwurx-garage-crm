import { createHmac } from "node:crypto"
import type { CampaignRow, CheckStatus, LiveResult, PlatformPerformance, ProposedAction } from "@/lib/ai-marketing/types"

/**
 * Server-only Meta Marketing API client. Credentials come from env and are sent
 * in the Authorization header (never in URLs, logs or responses). Every request
 * carries appsecret_proof so a leaked token alone cannot be replayed.
 *
 * This is separate from the existing lead-ads webhook, which uses
 * META_PAGE_ACCESS_TOKEN (a Page token that cannot manage ads).
 */
const VERSION = process.env.META_GRAPH_VERSION || "v23.0"
const GRAPH = `https://graph.facebook.com/${VERSION}`
const REQUIRED_ENV = ["META_APP_ID", "META_APP_SECRET", "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"] as const

export class MetaApiError extends Error {
  constructor(
    message: string,
    public kind: "expired_token" | "permission" | "rate_limit" | "account_disabled" | "invalid" | "network",
    public code?: number,
  ) {
    super(message)
  }
}

export function metaMissingEnv(): string[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]?.trim())
}

export function metaAccountId(): string {
  const raw = (process.env.META_AD_ACCOUNT_ID ?? "").trim()
  return raw.startsWith("act_") ? raw : `act_${raw}`
}

function proof(token: string) {
  return createHmac("sha256", process.env.META_APP_SECRET ?? "").update(token).digest("hex")
}

function classify(err: { code?: number; error_subcode?: number; message?: string; type?: string }): MetaApiError {
  const code = err.code ?? 0
  const msg = err.message ?? "Unknown Meta API error"
  if (code === 190 || code === 102) return new MetaApiError(`Access token invalid or expired: ${msg}`, "expired_token", code)
  if ([4, 17, 32, 613, 80000, 80004].includes(code) || (code >= 80000 && code < 80100))
    return new MetaApiError(`Meta API rate limit reached, try again later: ${msg}`, "rate_limit", code)
  if (code === 10 || code === 200 || (code >= 200 && code < 300) || code === 294)
    return new MetaApiError(`Missing permission: ${msg}`, "permission", code)
  if (code === 2635 || /disabled|unsettled/i.test(msg)) return new MetaApiError(msg, "account_disabled", code)
  return new MetaApiError(msg, "invalid", code)
}

async function graph<T>(
  path: string,
  params: Record<string, string> = {},
  init: { method?: "GET" | "POST"; token?: string } = {},
): Promise<T> {
  const token = init.token ?? process.env.META_ACCESS_TOKEN ?? ""
  const qs = new URLSearchParams({ ...params, appsecret_proof: proof(token) })
  const method = init.method ?? "GET"
  let res: Response
  try {
    res = await fetch(method === "GET" ? `${GRAPH}/${path}?${qs}` : `${GRAPH}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: method === "POST" ? qs : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new MetaApiError("Could not reach graph.facebook.com", "network")
  }
  const json = (await res.json().catch(() => ({}))) as { error?: Parameters<typeof classify>[0] } & T
  if (!res.ok || json.error) throw classify(json.error ?? { message: `HTTP ${res.status}` })
  return json
}

const ACCOUNT_STATUS: Record<number, string> = {
  1: "active",
  2: "disabled",
  3: "unsettled",
  7: "pending_risk_review",
  8: "pending_settlement",
  9: "in_grace_period",
  100: "pending_closure",
  101: "closed",
  201: "any_active",
  202: "any_closed",
}

export interface MetaCheck {
  status: CheckStatus
  summary: string
  canRead: boolean
  canManage: boolean
  details: Record<string, unknown>
}

/** Real authenticated test: token validity, granted scopes, ad accounts and the configured account's status. */
export async function checkMeta(): Promise<MetaCheck> {
  const missing = metaMissingEnv()
  if (missing.length) {
    return {
      status: "not_configured",
      summary: `Missing environment variables: ${missing.join(", ")}`,
      canRead: false,
      canManage: false,
      details: { missing, leadWebhookTokenPresent: Boolean(process.env.META_PAGE_ACCESS_TOKEN) },
    }
  }
  try {
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
    const [debug, perms, accounts] = await Promise.all([
      graph<{ data: { is_valid: boolean; expires_at?: number; type?: string; app_id?: string; scopes?: string[] } }>(
        "debug_token",
        { input_token: process.env.META_ACCESS_TOKEN ?? "" },
        { token: appToken },
      ),
      graph<{ data: { permission: string; status: string }[] }>("me/permissions"),
      graph<{ data: { id: string; name: string; account_status: number; currency: string }[] }>("me/adaccounts", {
        fields: "id,name,account_status,currency",
        limit: "50",
      }),
    ])
    const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission)
    const hasRead = granted.includes("ads_read") || granted.includes("ads_management")
    const hasManage = granted.includes("ads_management")
    const target = metaAccountId()
    const account = await graph<{ id: string; name: string; account_status: number; disable_reason?: number; currency: string }>(
      target,
      { fields: "id,name,account_status,disable_reason,currency" },
    ).catch((e: unknown) => (e instanceof MetaApiError ? e : null))

    const accountOk = account && !(account instanceof MetaApiError) && account.account_status === 1
    const expiresAt = debug.data.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : "never"
    const details = {
      graphVersion: VERSION,
      tokenValid: debug.data.is_valid,
      tokenType: debug.data.type ?? null,
      tokenAppMatches: debug.data.app_id === process.env.META_APP_ID,
      tokenExpiresAt: expiresAt,
      grantedPermissions: granted,
      accessibleAccounts: accounts.data.map((a) => ({
        id: a.id,
        name: a.name,
        status: ACCOUNT_STATUS[a.account_status] ?? String(a.account_status),
        currency: a.currency,
      })),
      configuredAccount: target,
      configuredAccountStatus:
        account instanceof MetaApiError
          ? `error: ${account.message}`
          : account
            ? ACCOUNT_STATUS[account.account_status] ?? String(account.account_status)
            : "unknown",
      canRead: Boolean(hasRead && accountOk),
      canManage: Boolean(hasManage && accountOk),
    }
    if (!debug.data.is_valid) {
      return { status: "error", summary: "Access token is not valid.", canRead: false, canManage: false, details }
    }
    if (!hasRead || !accountOk) {
      const why = !hasRead ? "ads_read / ads_management not granted" : `ad account ${target} is not active or not accessible`
      return { status: "limited", summary: `Authenticated, but ${why}.`, canRead: false, canManage: false, details }
    }
    return {
      status: hasManage ? "connected" : "limited",
      summary: hasManage
        ? `Connected to ${target} with ads_read and ads_management.`
        : `Connected to ${target} read-only (ads_management not granted).`,
      canRead: true,
      canManage: hasManage,
      details,
    }
  } catch (e) {
    const err = e instanceof MetaApiError ? e : new MetaApiError("Unexpected error", "invalid")
    return {
      status: "error",
      summary: err.message,
      canRead: false,
      canManage: false,
      details: { kind: err.kind, code: err.code ?? null, graphVersion: VERSION },
    }
  }
}

type Insight = { campaign_id: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }

const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"])

/** Last-30-day campaign performance straight from the Marketing API. */
export async function getMetaPerformance(): Promise<LiveResult<PlatformPerformance>> {
  const missing = metaMissingEnv()
  if (missing.length) return { state: "not_configured", missing }
  const act = metaAccountId()
  try {
    const [account, campaigns, insights, adsets, ads] = await Promise.all([
      graph<{ currency: string }>(act, { fields: "currency" }),
      graph<{ data: { id: string; name: string; effective_status: string; objective?: string; daily_budget?: string }[] }>(
        `${act}/campaigns`,
        { fields: "id,name,effective_status,objective,daily_budget", limit: "100" },
      ),
      graph<{ data: Insight[] }>(`${act}/insights`, {
        level: "campaign",
        date_preset: "last_30d",
        fields: "campaign_id,spend,impressions,clicks,actions",
        limit: "200",
      }),
      graph<{ summary?: { total_count: number } }>(`${act}/adsets`, { summary: "total_count", limit: "1" }),
      graph<{ summary?: { total_count: number } }>(`${act}/ads`, { summary: "total_count", limit: "1" }),
    ])
    const byId = new Map(insights.data.map((i) => [i.campaign_id, i]))
    const rows: CampaignRow[] = campaigns.data.map((c) => {
      const i = byId.get(c.id)
      const leads = (i?.actions ?? []).filter((a) => LEAD_ACTIONS.has(a.action_type)).reduce((n, a) => n + Number(a.value), 0)
      return {
        id: c.id,
        name: c.name,
        status: c.effective_status,
        objective: c.objective ?? null,
        // Meta budgets are in the account currency's minor unit.
        dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        spend: Number(i?.spend ?? 0),
        impressions: Number(i?.impressions ?? 0),
        clicks: Number(i?.clicks ?? 0),
        leads,
      }
    })
    return {
      state: "ok",
      data: {
        platform: "meta",
        accountId: act,
        currency: account.currency,
        rangeLabel: "last_30d",
        campaigns: rows.sort((a, b) => b.spend - a.spend),
        totals: sumTotals(rows),
        adSetCount: adsets.summary?.total_count ?? null,
        adCount: ads.summary?.total_count ?? null,
      },
    }
  } catch (e) {
    return { state: "error", error: e instanceof Error ? e.message : "Meta request failed" }
  }
}

export function sumTotals(rows: CampaignRow[]) {
  return rows.reduce(
    (t, r) => ({
      spend: t.spend + r.spend,
      impressions: t.impressions + r.impressions,
      clicks: t.clicks + r.clicks,
      leads: t.leads + r.leads,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0 },
  )
}

/** Reads the values an action would change, for the before/after audit record. */
export async function metaSnapshot(campaignId: string) {
  return graph<{ id: string; name: string; status: string; effective_status: string; daily_budget?: string }>(campaignId, {
    fields: "id,name,status,effective_status,daily_budget",
  })
}

/**
 * Executes ONE approved action. New campaigns are always created PAUSED so
 * nothing starts spending without a further explicit status change.
 */
export async function executeMetaAction(action: ProposedAction): Promise<Record<string, unknown>> {
  const act = metaAccountId()
  if (action.kind === "create_campaign") {
    if (!action.name) throw new MetaApiError("Campaign name is required", "invalid")
    const params: Record<string, string> = {
      name: action.name,
      objective: action.objective || "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: "[]",
    }
    if (action.daily_budget_aed) params.daily_budget = String(Math.round(action.daily_budget_aed * 100))
    else params.is_adset_budget_sharing_enabled = "false"
    return graph<Record<string, unknown>>(`${act}/campaigns`, params, { method: "POST" })
  }
  if (!action.campaign_id) throw new MetaApiError("campaign_id is required", "invalid")
  if (action.kind === "update_budget") {
    if (!action.daily_budget_aed || action.daily_budget_aed <= 0) throw new MetaApiError("A positive budget is required", "invalid")
    return graph(action.campaign_id, { daily_budget: String(Math.round(action.daily_budget_aed * 100)) }, { method: "POST" })
  }
  if (action.kind === "set_status") {
    if (action.status !== "PAUSED" && action.status !== "ACTIVE") throw new MetaApiError("Status must be PAUSED or ACTIVE", "invalid")
    return graph(action.campaign_id, { status: action.status }, { method: "POST" })
  }
  throw new MetaApiError("This recommendation has no executable action", "invalid")
}
