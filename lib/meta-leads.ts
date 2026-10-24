import "server-only"
import { insertAdLead, normalizePhone } from "@/lib/ad-leads"
import { getMetaToken } from "@/lib/meta-token"

const GRAPH = "https://graph.facebook.com/v21.0"
const LEAD_FIELDS = "created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic"

export interface GraphLead {
  id: string
  created_time?: string
  field_data?: { name: string; values?: string[] }[]
  ad_id?: string
  ad_name?: string
  adset_name?: string
  campaign_name?: string
  form_id?: string
  platform?: string
  is_organic?: boolean
}

async function graph<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith("https://") ? path : `${GRAPH}/${path}`
  const sep = url.includes("?") ? "&" : "?"
  const res = await fetch(`${url}${url.includes("access_token=") ? "" : `${sep}access_token=${encodeURIComponent(token)}`}`, {
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Graph API ${res.status}`)
  return body as T
}

export function fetchMetaLead(leadgenId: string, token: string) {
  return graph<GraphLead>(`${encodeURIComponent(leadgenId)}?fields=${LEAD_FIELDS}`, token)
}

export function mapMetaFields(lead: GraphLead) {
  const fields: Record<string, string> = {}
  for (const f of lead.field_data ?? []) fields[f.name.toLowerCase()] = (f.values ?? []).join(", ")
  const take = (...keys: string[]) => {
    for (const k of keys) {
      const v = fields[k]
      if (v) {
        delete fields[k]
        return v
      }
    }
    return null
  }
  const full = take("full_name", "name")
  const first = take("first_name")
  const last = take("last_name")
  const name = full || [first, last].filter(Boolean).join(" ") || null
  const phone = normalizePhone(take("phone_number", "phone", "mobile_number", "whatsapp_number"))
  const email = take("email", "work_email")
  return { name, phone, email, extra: fields }
}

/** Saves a Meta lead into CRM Leads once (deduplicated by lead id). Returns true when newly created. */
export function saveMetaLead(lead: GraphLead, context: { pageId?: string | null; formId?: string | null; adId?: string | null } = {}) {
  const isInstagram = lead.platform === "ig" || lead.platform === "instagram"
  return insertAdLead({
    externalId: `meta:${lead.id}`,
    source: isInstagram ? "instagram" : "facebook",
    ...mapMetaFields(lead),
    metadata: {
      provider: "meta",
      platform: lead.platform ?? null,
      campaign: lead.campaign_name ?? null,
      adset: lead.adset_name ?? null,
      ad: lead.ad_name ?? null,
      form_id: lead.form_id ?? context.formId ?? null,
      page_id: context.pageId ?? null,
      ad_id: lead.ad_id ?? context.adId ?? null,
      organic: lead.is_organic ?? false,
      submitted_at: lead.created_time ?? null,
    },
  })
}

interface Paged<T> {
  data?: T[]
  paging?: { next?: string }
}

async function* pages<T>(first: string, token: string, maxPages = 20) {
  let next: string | undefined = first
  for (let i = 0; next && i < maxPages; i++) {
    const page: Paged<T> = await graph<Paged<T>>(next, token)
    yield page.data ?? []
    next = page.paging?.next
  }
}

export interface MetaImportResult {
  pageName: string | null
  forms: number
  found: number
  created: number
  errors: string[]
}

interface PageTarget {
  id: string
  name?: string
  token: string
}

/**
 * Accepts either a Page token or a user token. A user token is expanded into
 * the Pages it manages, each with its own Page token (lead forms require one).
 */
async function resolvePages(token: string): Promise<PageTarget[]> {
  try {
    const accounts = await graph<Paged<{ id: string; name?: string; access_token?: string }>>(
      "me/accounts?fields=id,name,access_token&limit=100",
      token,
    )
    const managed = (accounts.data ?? []).filter((p) => p.access_token)
    if (managed.length) return managed.map((p) => ({ id: p.id, name: p.name, token: p.access_token! }))
  } catch {
    // Page tokens cannot list me/accounts; fall through.
  }

  // Pages managed through Business Manager are missing from me/accounts, but the
  // token's granular scopes or its businesses still name them, and each can issue its own Page token.
  const candidates = [...new Set([...(await scopedPageIds(token)), ...(await businessPageIds(token))])]
  if (candidates.length) {
    const found: PageTarget[] = []
    for (const id of candidates) {
      try {
        const page = await graph<{ id: string; name?: string; access_token?: string }>(
          `${encodeURIComponent(id)}?fields=id,name,access_token`,
          token,
        )
        if (page.access_token) found.push({ id: page.id, name: page.name, token: page.access_token })
      } catch {
        // Not a Page, or no access; skip it.
      }
    }
    if (found.length) return found
  }

  // `category` is not a valid field on User nodes, so ask debug_token for the token type instead.
  const debug = await graph<{ data?: { type?: string } }>(
    `debug_token?input_token=${encodeURIComponent(token)}`,
    token,
  ).catch(() => null)
  if (debug?.data?.type === "PAGE") {
    const me = await graph<{ id: string; name?: string }>("me?fields=id,name", token).catch(() => null)
    if (me) return [{ id: me.id, name: me.name, token }]
  }
  throw new Error(
    `${NO_PAGE_ACCESS}${candidates.length ? "" : " No Facebook Page is linked to this token."}`,
  )
}

const NO_PAGE_ACCESS =
  "The Meta token belongs to a person or system user, not a Page, and cannot open any Page's lead forms."

async function businessPageIds(token: string): Promise<string[]> {
  try {
    const businesses = await graph<Paged<{ id: string }>>("me/businesses?fields=id&limit=50", token)
    const ids: string[] = []
    for (const b of businesses.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"]) {
        try {
          const res = await graph<Paged<{ id: string }>>(`${b.id}/${edge}?fields=id&limit=100`, token)
          ids.push(...(res.data ?? []).map((p) => p.id))
        } catch {
          // Edge not available for this business; skip it.
        }
      }
    }
    return ids
  } catch {
    return []
  }
}

async function scopedPageIds(token: string): Promise<string[]> {
  try {
    const res = await graph<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
      `debug_token?input_token=${encodeURIComponent(token)}`,
      token,
    )
    const scopes = res.data?.granular_scopes ?? []
    const pageScopes = new Set(["pages_show_list", "leads_retrieval", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads"])
    return [...new Set(scopes.filter((s) => pageScopes.has(s.scope)).flatMap((s) => s.target_ids ?? []))]
  } catch {
    return []
  }
}

const pageTokenCache = new Map<string, string>()

/** Returns a Page token for the given Page when the configured token can issue one; otherwise the token itself. */
export async function pageTokenFor(pageId: string | null | undefined, token: string): Promise<string> {
  if (!pageId) return token
  const cached = pageTokenCache.get(pageId)
  if (cached) return cached
  try {
    const page = await graph<{ access_token?: string }>(`${encodeURIComponent(pageId)}?fields=access_token`, token)
    if (page.access_token) {
      pageTokenCache.set(pageId, page.access_token)
      return page.access_token
    }
  } catch {
    // Already a Page token (or no access); use it as-is.
  }
  return token
}

const SYNC_INTERVAL_MS = 60_000
const SYNC_OVERLAP_S = 15 * 60
let lastSync: { at: number; sinceUnix: number } | null = null
let inflight: Promise<MetaImportResult | null> | null = null
const subscribedPages = new Set<string>()

export interface MetaSyncStatus {
  at: string
  forms: number
  found: number
  created: number
  error: string | null
}
let lastStatus: MetaSyncStatus | null = null

/** Result of the most recent automatic sync on this server instance. */
export function lastMetaSyncStatus(): MetaSyncStatus | null {
  return lastStatus
}

/** Turns Graph permission errors into an instruction the owner can act on. */
export function isMetaTokenExpired(message: string | null | undefined): boolean {
  return !!message && /session has expired|access token has expired|error validating access token/i.test(message)
}

export function explainMetaError(message: string): string {
  if (isMetaTokenExpired(message)) {
    return "Meta token has expired, so no new leads are coming in. Paste a fresh token in Reconnect Meta below once; the CRM turns it into a permanent Page token and keeps it."
  }
  if (message.includes(NO_PAGE_ACCESS) || /nonexisting field \(leadgen_forms\)/.test(message)) {
    return "The saved Meta token cannot open the Shwurx Auto Service Center Page, so no leads are imported. In Business Settings → System users → shenotey eskander → Generate new token, tick pages_show_list, pages_read_engagement, leads_retrieval, pages_manage_metadata and pages_manage_ads, then paste it in Replace Meta token."
  }
  if (/pages_manage_ads/.test(message)) {
    return "Meta token is missing the pages_manage_ads permission, so lead forms cannot be read. Generate a new token with pages_manage_ads, leads_retrieval, pages_show_list, pages_read_engagement and pages_manage_metadata, then update META_PAGE_ACCESS_TOKEN."
  }
  if (/leads_retrieval/.test(message)) {
    return "Meta token is missing leads_retrieval. Regenerate the token with that permission and update META_PAGE_ACCESS_TOKEN."
  }
  return message
}

/**
 * Keeps CRM Leads in step with Meta without a manual import. The first run on a
 * server instance pulls every lead; later runs only ask Meta for leads created
 * since the previous run (with an overlap window), throttled to once a minute.
 */
export function syncMetaLeads(): Promise<MetaImportResult | null> {
  if (inflight) return inflight
  if (lastSync && Date.now() - lastSync.at < SYNC_INTERVAL_MS) return Promise.resolve(null)

  const startedUnix = Math.floor(Date.now() / 1000)
  const since = lastSync ? lastSync.sinceUnix - SYNC_OVERLAP_S : undefined
  inflight = getMetaToken()
    .then((token) => {
      if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not configured")
      return importAllMetaLeads(token, { since, subscribe: true })
    })
    .then((r) => {
      lastSync = { at: Date.now(), sinceUnix: startedUnix }
      lastStatus = { at: new Date().toISOString(), forms: r.forms, found: r.found, created: r.created, error: r.errors[0] ?? null }
      if (r.errors.length) console.error("Meta lead sync errors:", r.errors.slice(0, 5))
      return r
    })
    .catch((err) => {
      lastSync = { at: Date.now(), sinceUnix: lastSync?.sinceUnix ?? 0 }
      lastStatus = { at: new Date().toISOString(), forms: 0, found: 0, created: 0, error: (err as Error).message }
      console.error("Meta lead sync failed:", (err as Error).message)
      return null
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Makes sure the Page delivers leadgen webhooks to this app (needs pages_manage_metadata; best effort). */
async function ensureLeadgenSubscription(target: PageTarget) {
  if (subscribedPages.has(target.id)) return
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(target.id)}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(target.token)}`,
      { method: "POST", cache: "no-store" },
    )
    if (res.ok) subscribedPages.add(target.id)
  } catch {
    // Polling sync still covers the page if the subscription cannot be created.
  }
}

/** Pulls leads submitted on the lead forms of the token's Page(s); all of them unless `since` is given. */
export async function importAllMetaLeads(
  token: string,
  options: { since?: number; subscribe?: boolean } = {},
): Promise<MetaImportResult> {
  const targets = await resolvePages(token)
  if (options.subscribe) await Promise.all(targets.map(ensureLeadgenSubscription))
  const result: MetaImportResult = {
    pageName: targets.map((t) => t.name ?? t.id).join(", ") || null,
    forms: 0,
    found: 0,
    created: 0,
    errors: [],
  }
  for (const target of targets) {
    try {
      await importPageLeads(target, result, options.since)
    } catch (err) {
      result.errors.push(`page ${target.name ?? target.id}: ${(err as Error).message}`)
    }
  }
  return result
}

async function importPageLeads({ id: pageId, token }: PageTarget, result: MetaImportResult, since?: number) {
  const page = { id: pageId }
  const filter = since
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]))}`
    : ""
  for await (const forms of pages<{ id: string; name?: string }>(`${page.id}/leadgen_forms?fields=id,name&limit=100`, token)) {
    for (const form of forms) {
      result.forms++
      try {
        for await (const leads of pages<GraphLead>(`${form.id}/leads?fields=${LEAD_FIELDS}&limit=100${filter}`, token)) {
          for (const lead of leads) {
            result.found++
            try {
              if (await saveMetaLead(lead, { pageId: page.id, formId: form.id })) result.created++
            } catch (err) {
              result.errors.push(`lead ${lead.id}: ${(err as Error).message}`)
            }
          }
        }
      } catch (err) {
        result.errors.push(`form ${form.name ?? form.id}: ${(err as Error).message}`)
      }
    }
  }
  return result
}
