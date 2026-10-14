import "server-only"
import { z } from "zod"
import { put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { d360DownloadMedia } from "@/lib/d360"
import { notifyByPermission, notifyUser } from "@/lib/actions-notifications"

const mediaSchema = z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional(), filename: z.string().optional() }).passthrough()

const messageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    image: mediaSchema.optional(),
    document: mediaSchema.optional(),
    audio: mediaSchema.optional(),
    video: mediaSchema.optional(),
    sticker: mediaSchema.optional(),
    button: z.object({ text: z.string().optional() }).passthrough().optional(),
    interactive: z.record(z.string(), z.unknown()).optional(),
    referral: z
      .object({
        source_url: z.string().optional(),
        source_type: z.string().optional(),
        source_id: z.string().optional(),
        headline: z.string().optional(),
        body: z.string().optional(),
        ctwa_clid: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const statusSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    timestamp: z.string().optional(),
    errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough()

export const webhookSchema = z
  .object({
    entry: z.array(
      z
        .object({
          changes: z.array(
            z
              .object({
                value: z
                  .object({
                    contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
                    messages: z.array(messageSchema).optional(),
                    statuses: z.array(statusSchema).optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough()

type InboundMessage = z.infer<typeof messageSchema>

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 }

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "")
}

function last9(p: string) {
  return normalizePhone(p).slice(-9)
}

function detectSource(ref: InboundMessage["referral"]): string {
  if (!ref) return "direct"
  const url = (ref.source_url || "").toLowerCase()
  if (url.includes("instagram")) return "instagram_ad"
  if (url.includes("facebook") || url.includes("fb.") || ref.source_type === "ad") return "facebook_ad"
  return "other"
}

function previewOf(m: InboundMessage): string {
  if (m.text?.body) return m.text.body.slice(0, 140)
  const media = m.image || m.document || m.video
  if (media?.caption) return media.caption.slice(0, 140)
  if (m.button?.text) return m.button.text
  return `[${m.type}]`
}

async function matchCustomer(phone: string): Promise<string | null> {
  const svc = createServiceClient()
  const tail = last9(phone)
  if (tail.length < 9) return null
  const { data } = await svc
    .from("customers")
    .select("id")
    .or(`mobile.ilike.%${tail},alt_mobile.ilike.%${tail},whatsapp.ilike.%${tail}`)
    .limit(2)
  return data?.length === 1 ? (data[0].id as string) : null
}

async function storeMedia(m: InboundMessage) {
  const media = m.image || m.document || m.audio || m.video || m.sticker
  if (!media) return null
  try {
    const { data, mime } = await d360DownloadMedia(media.id)
    const ext = (mime.split("/")[1] || "bin").split(";")[0]
    const blob = await put(`whatsapp/${m.id}.${ext}`, Buffer.from(data), {
      access: "private",
      contentType: mime,
      allowOverwrite: true,
    })
    return { path: blob.pathname, mime, filename: media.filename ?? null, mediaId: media.id }
  } catch (err) {
    console.error("whatsapp media download failed:", (err as Error).message)
    return { path: null, mime: media.mime_type ?? null, filename: media.filename ?? null, mediaId: media.id }
  }
}

async function handleInbound(m: InboundMessage, contactName: string | undefined) {
  const svc = createServiceClient()
  const phone = normalizePhone(m.from)

  const { data: existingMsg } = await svc.from("wa_messages").select("id").eq("wamid", m.id).maybeSingle()
  if (existingMsg) return

  const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString()

  let { data: conv } = await svc
    .from("wa_conversations")
    .select("id, assigned_to, unread_count, customer_id, wa_name, lead_source")
    .eq("wa_phone", phone)
    .maybeSingle()

  const isNew = !conv
  if (!conv) {
    const customerId = await matchCustomer(phone)
    const { data: created, error } = await svc
      .from("wa_conversations")
      .upsert(
        {
          wa_phone: phone,
          wa_name: contactName ?? null,
          customer_id: customerId,
          lead_source: detectSource(m.referral),
          referral: m.referral ?? null,
        },
        { onConflict: "wa_phone" },
      )
      .select("id, assigned_to, unread_count, customer_id, wa_name, lead_source")
      .single()
    if (error) throw error
    conv = created
    await svc.from("wa_lead_events").insert({
      conversation_id: conv.id,
      action: "lead_created",
      detail: { source: detectSource(m.referral), customer_matched: !!customerId },
    })
  }

  const media = await storeMedia(m)
  const { error: insErr } = await svc.from("wa_messages").insert({
    conversation_id: conv.id,
    wamid: m.id,
    direction: "in",
    type: m.type,
    body: m.text?.body ?? (m.image || m.document || m.video)?.caption ?? m.button?.text ?? null,
    media_id: media?.mediaId ?? null,
    media_blob_path: media?.path ?? null,
    media_mime: media?.mime ?? null,
    media_filename: media?.filename ?? null,
    status: "received",
    wa_timestamp: ts,
  })
  // Unique wamid: a concurrent duplicate delivery lost the race, nothing more to do.
  if (insErr) {
    if (insErr.code === "23505") return
    throw insErr
  }

  const update: Record<string, unknown> = {
    last_inbound_at: ts,
    last_message_at: ts,
    last_message_preview: previewOf(m),
    unread_count: (conv.unread_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }
  if (contactName && !conv.wa_name) update.wa_name = contactName
  if (m.referral && !isNew && conv.lead_source === "direct") {
    update.lead_source = detectSource(m.referral)
    update.referral = m.referral
  }
  await svc.from("wa_conversations").update(update).eq("id", conv.id)

  const who = contactName || `+${phone}`
  const payload = {
    title: isNew ? `New WhatsApp lead: ${who}` : `WhatsApp: ${who}`,
    body: previewOf(m),
    type: "info",
    link: `/whatsapp?c=${conv.id}`,
  }
  try {
    if (conv.assigned_to) await notifyUser(conv.assigned_to, payload)
    else if (isNew) await notifyByPermission("whatsapp.assign", payload)
  } catch (err) {
    console.error("whatsapp notify failed:", (err as Error).message)
  }
}

async function handleStatus(s: z.infer<typeof statusSchema>) {
  const svc = createServiceClient()
  const { data: msg } = await svc.from("wa_messages").select("id, status").eq("wamid", s.id).maybeSingle()
  if (!msg) return
  const next = s.status
  if ((STATUS_RANK[next] ?? -1) <= (STATUS_RANK[msg.status as string] ?? -1)) return
  await svc
    .from("wa_messages")
    .update({
      status: next,
      error: next === "failed" ? (s.errors?.[0]?.message || s.errors?.[0]?.title || "Delivery failed") : null,
    })
    .eq("id", msg.id)
}

export async function processWebhook(payload: z.infer<typeof webhookSchema>) {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const v = change.value
      const names = new Map((v.contacts ?? []).map((c) => [normalizePhone(c.wa_id), c.profile?.name]))
      for (const m of v.messages ?? []) await handleInbound(m, names.get(normalizePhone(m.from)))
      for (const s of v.statuses ?? []) await handleStatus(s)
    }
  }
}
