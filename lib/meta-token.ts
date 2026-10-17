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

/** Expiry of any token, read with the app token so it also works on expired tokens. 0 means never. */
async function tokenExpiry(token: string, appToken: string): Promise<number | null> {
  try {
    const r = await graphGet<{ data?: { expires_at?: number; data_access_expires_at?: number } }>(
      `debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
    )
    const exp = r.data?.expires_at
    return typeof exp === "number" ? exp : null
  } catch {
    return null
  }
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

  let pages: { id: string; name?: string; access_token?: string }[] = []
  try {
    const accounts = await graphGet<{ data?: { id: string; name?: string; access_token?: string }[] }>(
      `me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(longLived)}`,
    )
    pages = (accounts.data ?? []).filter((p) => p.access_token)
  } catch {
    // A Page token cannot list accounts.
  }

  let value: StoredMetaToken
  if (pages.length === 1) {
    const token = pages[0].access_token!
    value = {
      token,
      kind: "page",
      pages: [pages[0].name ?? pages[0].id],
      expiresAt: appToken ? await tokenExpiry(token, appToken) : null,
      savedAt: new Date().toISOString(),
    }
  } else {
    const me = await graphGet<{ id: string; name?: string }>(`me?fields=id,name&access_token=${encodeURIComponent(longLived)}`)
    value = {
      token: longLived,
      kind: pages.length ? "user" : "page",
      pages: pages.length ? pages.map((p) => p.name ?? p.id) : [me.name ?? me.id],
      expiresAt: appToken ? await tokenExpiry(longLived, appToken) : null,
      savedAt: new Date().toISOString(),
    }
  }

  await writeStored(value, userId)
  return value
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
