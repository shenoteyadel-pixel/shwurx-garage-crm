import "server-only"
import { createHmac } from "node:crypto"

/**
 * Shared secret 360dialog sends back on every webhook call.
 * Falls back to a value derived from the Supabase service key so no extra env var is required.
 */
export function webhookSecret(): string | null {
  const explicit = process.env.D360_WEBHOOK_SECRET
  if (explicit) return explicit
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!base) return null
  return createHmac("sha256", base).update("d360-webhook-v1").digest("hex")
}

const BASE = (process.env.D360_API_BASE_URL || "https://waba-v2.360dialog.io").replace(/\/+$/, "")

function apiKey(): string {
  const key = process.env.D360_API_KEY
  if (!key) throw new Error("D360_API_KEY is not configured")
  return key
}

/** Real delivery only when explicitly switched on. Everything else is stored as blocked_test_mode. */
export function sendingEnabled(): boolean {
  return process.env.D360_SEND_ENABLED === "true"
}

export type OutboundPayload =
  | { type: "text"; text: string }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; filename?: string; caption?: string }
  | { type: "template"; name: string; language: string; bodyParams?: string[] }

function buildBody(to: string, p: OutboundPayload) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to }
  switch (p.type) {
    case "text":
      return { ...base, type: "text", text: { body: p.text, preview_url: false } }
    case "image":
      return { ...base, type: "image", image: { link: p.link, caption: p.caption } }
    case "document":
      return { ...base, type: "document", document: { link: p.link, filename: p.filename, caption: p.caption } }
    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: p.name,
          language: { code: p.language },
          components: p.bodyParams?.length
            ? [{ type: "body", parameters: p.bodyParams.map((t) => ({ type: "text", text: t })) }]
            : [],
        },
      }
  }
}

export async function d360Send(to: string, payload: OutboundPayload): Promise<{ wamid: string }> {
  const res = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(to, payload)),
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { message?: string }
    meta?: { developer_message?: string }
  }
  if (!res.ok || !json.messages?.[0]?.id) {
    throw new Error(json.error?.message || json.meta?.developer_message || `360dialog error ${res.status}`)
  }
  return { wamid: json.messages[0].id }
}

/** Downloads inbound media. 360dialog proxies Meta's lookaside host through its own base URL. */
export async function d360DownloadMedia(mediaId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const metaRes = await fetch(`${BASE}/${encodeURIComponent(mediaId)}`, {
    headers: { "D360-API-KEY": apiKey() },
    cache: "no-store",
  })
  if (!metaRes.ok) throw new Error(`media lookup failed ${metaRes.status}`)
  const meta = (await metaRes.json()) as { url: string; mime_type?: string }
  const original = new URL(meta.url)
  const proxied = `${BASE}${original.pathname}${original.search}`
  const fileRes = await fetch(proxied, { headers: { "D360-API-KEY": apiKey() }, cache: "no-store" })
  if (!fileRes.ok) throw new Error(`media download failed ${fileRes.status}`)
  return { data: await fileRes.arrayBuffer(), mime: meta.mime_type || fileRes.headers.get("content-type") || "application/octet-stream" }
}

export function d360Configured(): boolean {
  return Boolean(process.env.D360_API_KEY)
}

/** Returns the webhook URL currently registered on 360dialog for this number, or null. */
export async function d360GetWebhook(): Promise<string | null> {
  const res = await fetch(`${BASE}/v1/configs/webhook`, { headers: { "D360-API-KEY": apiKey() }, cache: "no-store" })
  if (!res.ok) return null
  const json = (await res.json().catch(() => ({}))) as { url?: string }
  return json.url || null
}

export async function d360SetWebhook(url: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/v1/configs/webhook`, {
    method: "POST",
    headers: { "D360-API-KEY": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ url, headers }),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`360dialog rejected the webhook (${res.status}) ${text.slice(0, 200)}`)
  }
}

export interface WaTemplate {
  name: string
  language: string
  status: string
  category?: string
  body: string
  paramCount: number
}

export async function d360Templates(): Promise<WaTemplate[]> {
  const res = await fetch(`${BASE}/v1/configs/templates`, {
    headers: { "D360-API-KEY": apiKey() },
    next: { revalidate: 300 },
  })
  if (!res.ok) return []
  const json = (await res.json()) as {
    waba_templates?: { name: string; language: string; status: string; category?: string; components?: { type: string; text?: string }[] }[]
  }
  return (json.waba_templates ?? [])
    .filter((t) => t.status?.toLowerCase() === "approved")
    .map((t) => {
      const body = t.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? ""
      return {
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        body,
        paramCount: (body.match(/\{\{\d+\}\}/g) ?? []).length,
      }
    })
}
