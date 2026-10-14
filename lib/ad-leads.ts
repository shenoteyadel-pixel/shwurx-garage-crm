import "server-only"
import { createHmac } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { rotationCandidates, safeEqual, type WebhookKeyCandidate } from "@/lib/webhook-keys"

export type AdProvider = "meta" | "google"

function derive(label: string): string | null {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!base) return null
  return createHmac("sha256", base).update(label).digest("hex").slice(0, 40)
}

/** Token pasted into the Meta app's Webhooks "Verify token" field. */
export function metaVerifyToken(): string | null {
  return process.env.META_VERIFY_TOKEN || derive("meta-leadgen-verify-v1")
}

/** Key pasted into the Google Ads lead form webhook "Key" field; Google echoes it as google_key. */
export function googleWebhookKey(): string | null {
  return process.env.GOOGLE_ADS_WEBHOOK_KEY || derive("google-ads-lead-key-v1")
}

/** Keys accepted on incoming Google Ads webhooks: the current key plus GOOGLE_ADS_WEBHOOK_KEY_PREVIOUS during rotation. */
export function googleWebhookKeyCandidates(): WebhookKeyCandidate[] {
  return rotationCandidates(googleWebhookKey(), process.env.GOOGLE_ADS_WEBHOOK_KEY_PREVIOUS)
}

export function metaConfigured() {
  return {
    pageToken: Boolean(process.env.META_PAGE_ACCESS_TOKEN),
    appSecret: Boolean(process.env.META_APP_SECRET),
  }
}

export { safeEqual }

export interface AdLeadInput {
  externalId: string
  source: "facebook" | "instagram" | "google_ads"
  name: string | null
  phone: string | null
  email: string | null
  extra: Record<string, string>
  metadata: Record<string, unknown>
}

/** Inserts a lead once per external id. Returns true when a new row was created. */
export async function insertAdLead(input: AdLeadInput): Promise<boolean> {
  const svc = createServiceClient()
  const extraLines = Object.entries(input.extra)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
  const campaign = typeof input.metadata.campaign === "string" ? input.metadata.campaign : null

  const { error } = await svc.from("leads").insert({
    name: input.name,
    phone: input.phone,
    email: input.email,
    message: extraLines.length ? extraLines.join("\n") : null,
    service_interest: campaign,
    source: input.source,
    status: "new",
    metadata: { ...input.metadata, external_id: input.externalId },
  })
  if (error) {
    if (error.code === "23505") return false
    throw new Error(error.message)
  }
  return true
}

export async function logAdEvent(provider: AdProvider, authorized: boolean, payload: unknown) {
  const svc = createServiceClient()
  const { data } = await svc
    .from("ad_webhook_events")
    .insert({ provider, authorized, payload })
    .select("id")
    .single()
  return {
    async finish(result: { processed: boolean; leads?: number; error?: string | null }) {
      if (!data) return
      await svc
        .from("ad_webhook_events")
        .update({ processed: result.processed, leads_created: result.leads ?? 0, error: result.error ?? null })
        .eq("id", data.id)
    },
  }
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = trimmed.replace(/[^\d]/g, "")
  if (!digits) return null
  return trimmed.startsWith("+") ? `+${digits}` : digits
}
