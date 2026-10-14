"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { requireSession, ctxCan, logAction, ForbiddenError } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { d360Configured, d360GetWebhook, d360SetWebhook, webhookSecret } from "@/lib/d360"

export interface WebhookStatus {
  apiKey: boolean
  secret: boolean
  targetUrl: string
  registeredUrl: string | null
  registeredMatches: boolean
  events: number
  lastEventAt: string | null
  lastEventOk: boolean | null
  lastError: string | null
}

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

async function requireManager() {
  const ctx = await requireSession()
  if (!ctxCan(ctx, "whatsapp.assign")) throw new ForbiddenError("whatsapp.assign")
  return ctx
}

export async function getWebhookStatus(): Promise<WebhookStatus> {
  await requireManager()
  const svc = createServiceClient()
  const targetUrl = `${await siteOrigin()}/api/webhooks/360dialog`
  const [{ count }, { data: last }] = await Promise.all([
    svc.from("wa_webhook_events").select("id", { count: "exact", head: true }),
    svc.from("wa_webhook_events").select("received_at, signature_ok, processed, error").order("received_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  let registeredUrl: string | null = null
  if (d360Configured()) registeredUrl = await d360GetWebhook().catch(() => null)
  return {
    apiKey: d360Configured(),
    secret: Boolean(webhookSecret()),
    targetUrl,
    registeredUrl,
    registeredMatches: Boolean(registeredUrl && registeredUrl.split("?")[0] === targetUrl),
    events: count ?? 0,
    lastEventAt: last?.received_at ?? null,
    lastEventOk: last ? Boolean(last.signature_ok && last.processed) : null,
    lastError: last ? (last.signature_ok ? last.error : "Rejected: webhook secret mismatch") : null,
  }
}

export async function connectWebhook(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireManager()
  const secret = webhookSecret()
  if (!d360Configured()) return { ok: false, error: "D360_API_KEY is not set on this deployment." }
  if (!secret) return { ok: false, error: "Webhook secret could not be generated on this deployment." }
  const url = `${await siteOrigin()}/api/webhooks/360dialog`
  try {
    await d360SetWebhook(url, { "x-wurx-webhook-secret": secret })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  await logAction(ctx, "whatsapp.webhook_connected", "wa_webhook", null, { url })
  revalidatePath("/whatsapp/dashboard")
  return { ok: true, url }
}
