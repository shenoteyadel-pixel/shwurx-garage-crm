import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

const GRAPH = "https://graph.facebook.com/v21.0"
const SECRET_KEY = "meta"
const REFRESH_BEFORE_S = 10 * 24 * 3600

export interface StoredMetaToken {
  token: string
  kind: "page" | "user"
  pages: string[]
  expiresAt: number | null
  savedAt: string
}

export interface MetaTokenInfo {
  source: "stored" | "env" | "none"
  kind: "page" | "user" | null
  pages: string[]
  expiresAt: number | null
}

async function graphGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, { cache: "no-store" })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Graph API ${res.status}`)
  return body as T
}

async function readStored(): Promise<StoredMetaToken | null> {
  const svc = createServiceClient()
  const { data } = await svc.from("app_secrets").select("value").eq("key", SECRET_KEY).maybeSingle()
  if (!data?.value) return null
  try {
    const value = JSON.parse(data.value as string) as StoredMetaToken
    return value?.token ? value : null
  } catch {
    return null
  }
}

async function writeStored(value: StoredMetaToken, _userId?: string | null) {
  const svc = createServiceClient()
  const { error } = await svc
    .from("app_secrets")
    .upsert({ key: SECRET_KEY, value: JSON.stringify(value) }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

/**
 * Turns any token from Meta (short-lived user token from Graph API Explorer, long-lived
 * user token, or Page token) into the longest-lasting one available and saves it.
 * Page tokens derived from a long-lived user token do not expire.
 */
export async function upgradeAndStoreMetaToken(input: string, userId?: string | null): Promise<StoredMetaToken> {
  const secret = process.env.META_APP_SECRET
  const raw = input.trim()
  if (!raw) throw new Error("Paste the token from Meta first.")

  const app = await graphGet<{ id: string }>(`app?access_token=${encodeURIComponent(raw)}`)
  const appToken = secret ? `${app.id}|${secret}` : null

  let longLived = raw
  if (secret) {
    try {
      const ex = await graphGet<{ access_token?: string }>(
        `oauth/access_token?grant_type=fb_exchange_token&client_id=${app.id}&client_secret=${encodeURIComponent(secret)}&fb_exchange_token=${encodeURIComponent(raw)}`,
      )
      if (ex.access_token) longLived = ex.access_token
    } catch {
      // Page tokens cannot be exchanged; keep the token as given.
    }
  }

  const info = await inspectToken(longLived, appToken)
  if (!info.valid) throw new Error(info.error ?? "Meta says this token is not valid. Generate a new one and try again.")

  const savedAt = new Date().toISOString()
  let value: StoredMetaToken

  if (info.type === "PAGE") {
    const me = await graphGet<{ id: string; name?: string }>(`me?fields=id,name&access_token=${encodeURIComponent(longLived)}`)
    value = { token: longLived, kind: "page", pages: [me.name ?? me.id], expiresAt: info.expiresAt, savedAt }
  } else {
    const pages = await findPageTokens(longLived, info.pageIds)
    if (!pages.length) {
      const missing = REQUIRED_PAGE_SCOPES.filter((s) => !info.scopes.includes(s))
      throw new Error(
        `This ${info.type === "SYSTEM_USER" ? "system user" : "user"} token cannot open any Facebook Page, so it was not saved and the current connection is unchanged.` +
          (missing.length ? ` Missing permissions: ${missing.join(", ")}.` : " Check that the token's user has a role on the Page."),
      )
    }
    if (pages.length === 1) {
      const token = pages[0].access_token
      const pageInfo = await inspectToken(token, appToken)
      value = { token, kind: "page", pages: [pages[0].name ?? pages[0].id], expiresAt: pageInfo.expiresAt, savedAt }
    } else {
      value = { token: longLived, kind: "user", pages: pages.map((p) => p.name ?? p.id), expiresAt: info.expiresAt, savedAt }
    }
  }

  await writeStored(value, userId)
  return value
}

const REQUIRED_PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "leads_retrieval", "pages_manage_metadata"]
const PAGE_SCOPES = new Set([...REQUIRED_PAGE_SCOPES, "pages_manage_ads"])

interface TokenInspection {
  valid: boolean
  type: "PAGE" | "USER" | "SYSTEM_USER" | "APP" | null
  expiresAt: number | null
  scopes: string[]
  pageIds: string[]
  error?: string
}

/** Reads token type, validity, expiry and granted scopes via debug_token. Never returns the token. */
async function inspectToken(token: string, appToken: string | null): Promise<TokenInspection> {
  try {
    const r = await graphGet<{
      data?: {
        is_valid?: boolean
        type?: TokenInspection["type"]
        expires_at?: number
        scopes?: string[]
        profile_id?: string
        granular_scopes?: { scope: string; target_ids?: string[] }[]
        error?: { message?: string }
      }
    }>(`debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken ?? token)}`)
    const d = r.data ?? {}
    const pageIds = new Set<string>()
    for (const s of d.granular_scopes ?? []) if (PAGE_SCOPES.has(s.scope)) s.target_ids?.forEach((id) => pageIds.add(id))
    return {
      valid: d.is_valid === true,
      type: d.type ?? null,
      expiresAt: d.is_valid && typeof d.expires_at === "number" ? d.expires_at : null,
      scopes: d.scopes ?? [],
      pageIds: [...pageIds],
      error: d.error?.message,
    }
  } catch (err) {
    return { valid: false, type: null, expiresAt: null, scopes: [], pageIds: [], error: (err as Error).message }
  }
}

/** Page tokens the given user/system-user token can issue, from me/accounts, granular scopes, then its businesses. */
async function findPageTokens(token: string, scopedIds: string[]) {
  type Page = { id: string; name?: string; access_token?: string }
  const t = encodeURIComponent(token)
  try {
    const accounts = await graphGet<{ data?: Page[] }>(`me/accounts?fields=id,name,access_token&limit=100&access_token=${t}`)
    const managed = (accounts.data ?? []).filter((p): p is Page & { access_token: string } => !!p.access_token)
    if (managed.length) return managed
  } catch {
    // Business Manager Pages can be missing from me/accounts; try the other sources.
  }

  const ids = new Set(scopedIds)
  try {
    const biz = await graphGet<{ data?: { id: string }[] }>(`me/businesses?fields=id&limit=50&access_token=${t}`)
    for (const b of biz.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"]) {
        try {
          const res = await graphGet<{ data?: { id: string }[] }>(`${b.id}/${edge}?fields=id&limit=100&access_token=${t}`)
          res.data?.forEach((p) => ids.add(p.id))
        } catch {
          // Edge not available for this business.
        }
      }
    }
  } catch {
    // Token cannot list businesses.
  }

  const found: (Page & { access_token: string })[] = []
  for (const id of ids) {
    try {
      const p = await graphGet<Page>(`${encodeURIComponent(id)}?fields=id,name,access_token&access_token=${t}`)
      if (p.access_token) found.push({ ...p, access_token: p.access_token })
    } catch {
      // Not a Page or no access.
    }
  }
  return found
}

let autoUpgradeTried = false

/** Token used for all Meta calls: the saved one first, otherwise META_PAGE_ACCESS_TOKEN. */
export async function getMetaToken(): Promise<string | null> {
  const stored = await readStored().catch(() => null)
  if (stored) {
    const now = Math.floor(Date.now() / 1000)
    if (stored.kind === "user" && stored.expiresAt && stored.expiresAt - now < REFRESH_BEFORE_S && stored.expiresAt > now) {
      try {
        return (await upgradeAndStoreMetaToken(stored.token)).token
      } catch {
        return stored.token
      }
    }
    return stored.token
  }

  const env = process.env.META_PAGE_ACCESS_TOKEN
  if (!env) return null
  if (!autoUpgradeTried) {
    autoUpgradeTried = true
    try {
      return (await upgradeAndStoreMetaToken(env)).token
    } catch {
      // Env token is already expired or invalid; the owner reconnects from the Leads page.
    }
  }
  return env
}

export async function metaTokenInfo(): Promise<MetaTokenInfo> {
  const stored = await readStored().catch(() => null)
  if (stored) return { source: "stored", kind: stored.kind, pages: stored.pages, expiresAt: stored.expiresAt }
  if (process.env.META_PAGE_ACCESS_TOKEN) return { source: "env", kind: null, pages: [], expiresAt: null }
  return { source: "none", kind: null, pages: [], expiresAt: null }
}
