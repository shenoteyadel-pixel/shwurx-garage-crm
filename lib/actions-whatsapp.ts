"use server"

import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { requireSession, ctxCan, logAction, ForbiddenError, type SessionContext } from "@/lib/rbac/context"
import { d360Send, d360Templates, sendingEnabled, type OutboundPayload, type WaTemplate } from "@/lib/d360"
import { notifyUser } from "@/lib/actions-notifications"
import { WA_STATUSES, windowOpen, type WaConversationRow, type WaMessageRow } from "@/lib/whatsapp-status"
import { normalizePhone } from "@/lib/whatsapp-ingest"
import { put } from "@vercel/blob"

type Scope = { ctx: SessionContext; all: boolean }

async function scope(): Promise<Scope> {
  const ctx = await requireSession()
  if (ctxCan(ctx, "whatsapp.view_all")) return { ctx, all: true }
  if (ctxCan(ctx, "whatsapp.view_own")) return { ctx, all: false }
  throw new ForbiddenError("whatsapp.view_own")
}

/** Loads a conversation only if the caller is allowed to see it. */
async function loadScoped(id: string) {
  const s = await scope()
  const svc = createServiceClient()
  const { data: conv } = await svc.from("wa_conversations").select("*").eq("id", id).maybeSingle()
  if (!conv) throw new Error("Conversation not found")
  if (!s.all && conv.assigned_to && conv.assigned_to !== s.ctx.userId) throw new ForbiddenError("whatsapp.view_all")
  return { ...s, svc, conv }
}

async function event(convId: string, ctx: SessionContext, action: string, detail?: Record<string, unknown>) {
  const svc = createServiceClient()
  await svc.from("wa_lead_events").insert({ conversation_id: convId, actor_id: ctx.userId, actor_name: ctx.name, action, detail: detail ?? null })
  await logAction(ctx, `whatsapp.${action}`, "wa_conversation", convId, detail)
}

export interface InboxFilters {
  q?: string
  view?: "all" | "mine" | "unassigned"
  status?: string
  overdue?: boolean
  source?: string
}

export async function listConversations(filters: InboxFilters): Promise<{ rows: WaConversationRow[]; canAll: boolean; me: string }> {
  const s = await scope()
  const svc = createServiceClient()
  let q = svc
    .from("wa_conversations")
    .select(
      "id, wa_phone, wa_name, customer_id, assigned_to, status, lead_source, follow_up_at, last_inbound_at, last_message_at, last_message_preview, unread_count, customers(full_name), assignee:profiles!wa_conversations_assigned_to_fkey(full_name)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200)

  if (!s.all) q = q.or(`assigned_to.is.null,assigned_to.eq.${s.ctx.userId}`)
  if (filters.view === "mine") q = q.eq("assigned_to", s.ctx.userId)
  if (filters.view === "unassigned") q = q.is("assigned_to", null)
  if (filters.status) q = q.eq("status", filters.status)
  if (filters.source) q = q.eq("lead_source", filters.source)
  if (filters.overdue) q = q.lt("follow_up_at", new Date().toISOString()).not("status", "in", "(won,lost)")
  const term = filters.q?.trim().replace(/[,%()]/g, "")
  if (term) q = q.or(`wa_name.ilike.%${term}%,wa_phone.ilike.%${normalizePhone(term) || term}%,last_message_preview.ilike.%${term}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((r) => {
    const rec = r as unknown as Record<string, unknown> & {
      customers: { full_name: string } | null
      assignee: { full_name: string } | null
    }
    return {
      ...(rec as unknown as WaConversationRow),
      customer_name: rec.customers?.full_name ?? null,
      assigned_name: rec.assignee?.full_name ?? null,
    }
  })
  return { rows, canAll: s.all, me: s.ctx.userId }
}

export interface ConversationDetail {
  conv: WaConversationRow & {
    referral: Record<string, unknown> | null
    appointment_id: string | null
    quotation_id: string | null
    job_id: string | null
    lost_reason: string | null
  }
  messages: WaMessageRow[]
  notes: { id: string; author_name: string | null; text: string; created_at: string }[]
  events: { id: string; actor_name: string | null; action: string; detail: Record<string, unknown> | null; created_at: string }[]
  customer: { id: string; full_name: string; mobile: string | null; email: string | null } | null
  links: { appointment: string | null; job: string | null; quotation: string | null }
  perms: { send: boolean; assign: boolean; canAll: boolean }
  sendingLive: boolean
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const { ctx, all, svc, conv } = await loadScoped(id)

  const [msgs, notes, events, customer, assignee, appt, job] = await Promise.all([
    svc.from("wa_messages").select("*, sender:profiles!wa_messages_sent_by_fkey(full_name)").eq("conversation_id", id).order("created_at").limit(500),
    svc.from("wa_notes").select("id, author_name, text, created_at").eq("conversation_id", id).order("created_at", { ascending: false }),
    svc.from("wa_lead_events").select("id, actor_name, action, detail, created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(50),
    conv.customer_id ? svc.from("customers").select("id, full_name, mobile, email").eq("id", conv.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    conv.assigned_to ? svc.from("profiles").select("full_name").eq("id", conv.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    conv.appointment_id ? svc.from("appointments").select("preferred_date, service_interest").eq("id", conv.appointment_id).maybeSingle() : Promise.resolve({ data: null }),
    conv.job_id ? svc.from("jobs").select("job_number").eq("id", conv.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  if (conv.unread_count > 0 && (conv.assigned_to === ctx.userId || (!conv.assigned_to && all))) {
    await svc.from("wa_conversations").update({ unread_count: 0 }).eq("id", id)
  }

  return {
    conv: {
      ...conv,
      customer_name: (customer.data as { full_name?: string } | null)?.full_name ?? null,
      assigned_name: (assignee.data as { full_name?: string } | null)?.full_name ?? null,
    },
    messages: (msgs.data ?? []).map((m) => {
      const rec = m as Record<string, unknown> & { sender: { full_name: string } | null }
      return { ...(rec as unknown as WaMessageRow), sent_by_name: rec.sender?.full_name ?? null }
    }),
    notes: notes.data ?? [],
    events: events.data ?? [],
    customer: (customer.data as ConversationDetail["customer"]) ?? null,
    links: {
      appointment: appt.data
        ? `${(appt.data as { preferred_date?: string }).preferred_date ?? "Booked"} · ${(appt.data as { service_interest?: string }).service_interest ?? ""}`.trim()
        : null,
      job: (job.data as { job_number?: string } | null)?.job_number ?? null,
      quotation: conv.quotation_id ? "Linked" : null,
    },
    perms: { send: ctxCan(ctx, "whatsapp.send"), assign: ctxCan(ctx, "whatsapp.assign"), canAll: all },
    sendingLive: sendingEnabled(),
  }
}

export async function claimConversation(id: string) {
  const { ctx, svc, conv } = await loadScoped(id)
  if (conv.assigned_to && conv.assigned_to !== ctx.userId) throw new Error("Already assigned to someone else")
  const { data } = await svc
    .from("wa_conversations")
    .update({ assigned_to: ctx.userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("assigned_to", null)
    .select("id")
  if (!data?.length) throw new Error("Someone claimed this lead first")
  await event(id, ctx, "claimed")
}

export async function assignConversation(id: string, userId: string | null) {
  const { ctx, svc, conv } = await loadScoped(id)
  if (!ctxCan(ctx, "whatsapp.assign")) throw new ForbiddenError("whatsapp.assign")
  if (userId) {
    const { data: p } = await svc.from("profiles").select("id, is_active, role").eq("id", userId).maybeSingle()
    if (!p?.is_active || p.role === "customer") throw new Error("Invalid staff member")
  }
  await svc.from("wa_conversations").update({ assigned_to: userId, updated_at: new Date().toISOString() }).eq("id", id)
  await event(id, ctx, conv.assigned_to ? "reassigned" : "assigned", { from: conv.assigned_to, to: userId })
  if (userId && userId !== ctx.userId) {
    await notifyUser(userId, { title: `WhatsApp lead assigned to you`, body: conv.wa_name || `+${conv.wa_phone}`, link: `/whatsapp?c=${id}` })
  }
}

const statusValues = WA_STATUSES.map((s) => s.value) as [string, ...string[]]

export async function setStatus(id: string, status: string, lostReason?: string) {
  const parsed = z.enum(statusValues).parse(status)
  const { ctx, svc, conv } = await loadScoped(id)
  await svc
    .from("wa_conversations")
    .update({ status: parsed, lost_reason: parsed === "lost" ? (lostReason?.slice(0, 500) || null) : null, updated_at: new Date().toISOString() })
    .eq("id", id)
  await event(id, ctx, "status_changed", { from: conv.status, to: parsed, lost_reason: lostReason })
}

export async function setFollowUp(id: string, at: string | null) {
  const value = at ? new Date(at) : null
  if (value && Number.isNaN(value.getTime())) throw new Error("Invalid date")
  const { ctx, svc } = await loadScoped(id)
  await svc.from("wa_conversations").update({ follow_up_at: value?.toISOString() ?? null }).eq("id", id)
  await event(id, ctx, "follow_up_set", { at: value?.toISOString() ?? null })
}

export async function addNote(id: string, text: string) {
  const clean = text.trim().slice(0, 2000)
  if (!clean) return
  const { ctx, svc } = await loadScoped(id)
  await svc.from("wa_notes").insert({ conversation_id: id, author_id: ctx.userId, author_name: ctx.name, text: clean })
}

export async function searchCustomers(term: string) {
  await scope()
  const t = term.trim().replace(/[,%()]/g, "")
  if (t.length < 2) return []
  const svc = createServiceClient()
  const digits = normalizePhone(t)
  const filter = digits.length >= 4 ? `full_name.ilike.%${t}%,mobile.ilike.%${digits.slice(-9)}%,whatsapp.ilike.%${digits.slice(-9)}%` : `full_name.ilike.%${t}%`
  const { data } = await svc.from("customers").select("id, full_name, mobile").or(filter).limit(8)
  return data ?? []
}

export async function linkCustomer(id: string, customerId: string | null) {
  const { ctx, svc } = await loadScoped(id)
  await svc.from("wa_conversations").update({ customer_id: customerId }).eq("id", id)
  await event(id, ctx, customerId ? "customer_linked" : "customer_unlinked", { customer_id: customerId })
}

export async function createCustomerFromConversation(id: string, fullName: string) {
  const { ctx, svc, conv } = await loadScoped(id)
  if (!ctxCan(ctx, "customers.create")) throw new ForbiddenError("customers.create")
  const name = fullName.trim().slice(0, 120)
  if (!name) throw new Error("Name is required")
  const tail = conv.wa_phone.slice(-9)
  const { data: dupes } = await svc
    .from("customers")
    .select("id, full_name")
    .or(`mobile.ilike.%${tail},alt_mobile.ilike.%${tail},whatsapp.ilike.%${tail}`)
    .limit(1)
  if (dupes?.length) throw new Error(`A customer with this number already exists: ${dupes[0].full_name}. Link it instead.`)
  const phone = `+${conv.wa_phone}`
  const { data: created, error } = await svc
    .from("customers")
    .insert({ full_name: name, mobile: phone, whatsapp: phone, created_by: ctx.userId })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await svc.from("wa_conversations").update({ customer_id: created.id }).eq("id", id)
  await event(id, ctx, "customer_created", { customer_id: created.id })
}

export async function searchLinkables(id: string, kind: "appointment" | "job" | "quotation") {
  const { svc, conv } = await loadScoped(id)
  const tail = conv.wa_phone.slice(-9)
  if (kind === "appointment") {
    const { data } = await svc
      .from("appointments")
      .select("id, name, preferred_date, service_interest")
      .or(conv.customer_id ? `customer_id.eq.${conv.customer_id},phone.ilike.%${tail}` : `phone.ilike.%${tail}`)
      .order("created_at", { ascending: false })
      .limit(10)
    return (data ?? []).map((a) => ({ id: a.id, label: `${a.preferred_date ?? "No date"} · ${a.service_interest ?? a.name ?? ""}` }))
  }
  const { data: jobs } = await svc
    .from("jobs")
    .select("id, job_number, vehicle_make, vehicle_model, quotations(id, total)")
    .or(conv.customer_id ? `customer_id.eq.${conv.customer_id},customer_mobile.ilike.%${tail}` : `customer_mobile.ilike.%${tail}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10)
  if (kind === "job") return (jobs ?? []).map((j) => ({ id: j.id, label: `${j.job_number} · ${j.vehicle_make ?? ""} ${j.vehicle_model ?? ""}` }))
  return (jobs ?? []).flatMap((j) =>
    ((j.quotations as { id: string; total: number }[] | null) ?? []).map((q) => ({ id: q.id, label: `${j.job_number} · AED ${Number(q.total ?? 0).toFixed(2)}` })),
  )
}

export async function linkRecord(id: string, kind: "appointment" | "job" | "quotation", recordId: string | null) {
  const { ctx, svc } = await loadScoped(id)
  if (recordId) {
    const allowed = await searchLinkables(id, kind)
    if (!allowed.some((r) => r.id === recordId)) throw new Error("That record does not belong to this customer")
  }
  const col = `${kind}_id`
  await svc.from("wa_conversations").update({ [col]: recordId }).eq("id", id)
  await event(id, ctx, `${kind}_${recordId ? "linked" : "unlinked"}`, { record_id: recordId })
}

export async function listTemplates(): Promise<WaTemplate[]> {
  await scope()
  try {
    return await d360Templates()
  } catch {
    return []
  }
}

export async function listStaff() {
  const ctx = await requireSession()
  if (!ctxCan(ctx, "whatsapp.assign")) return []
  const svc = createServiceClient()
  const { data } = await svc.from("profiles").select("id, full_name, role").eq("is_active", true).neq("role", "customer").order("full_name")
  return (data ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) || "Staff" }))
}

async function recordOutbound(id: string, payload: OutboundPayload, extra: { body: string | null; type: string; blobPath?: string; mime?: string; filename?: string }) {
  const { ctx, svc, conv } = await loadScoped(id)
  if (!ctxCan(ctx, "whatsapp.send")) throw new ForbiddenError("whatsapp.send")
  if (conv.assigned_to && conv.assigned_to !== ctx.userId && !ctxCan(ctx, "whatsapp.assign")) {
    throw new Error("This lead is assigned to another advisor")
  }
  if (payload.type !== "template" && !windowOpen(conv.last_inbound_at)) {
    throw new Error("The 24-hour window is closed. Send an approved template instead.")
  }

  const live = sendingEnabled()
  let wamid: string | null = null
  let status = "blocked_test_mode"
  let error: string | null = null
  if (live) {
    try {
      wamid = (await d360Send(conv.wa_phone, payload)).wamid
      status = "sent"
    } catch (err) {
      status = "failed"
      error = (err as Error).message
    }
  }

  const now = new Date().toISOString()
  await svc.from("wa_messages").insert({
    conversation_id: id,
    wamid,
    direction: "out",
    type: extra.type,
    body: extra.body,
    media_blob_path: extra.blobPath ?? null,
    media_mime: extra.mime ?? null,
    media_filename: extra.filename ?? null,
    status,
    error,
    sent_by: ctx.userId,
    wa_timestamp: now,
  })
  const patch: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: (extra.body || `[${extra.type}]`).slice(0, 140),
    unread_count: 0,
  }
  if (!conv.assigned_to) patch.assigned_to = ctx.userId
  if (conv.status === "new") patch.status = "contacted"
  await svc.from("wa_conversations").update(patch).eq("id", id)
  await event(id, ctx, "message_sent", { type: extra.type, status })
  if (status === "failed") throw new Error(error ?? "Send failed")
}

export async function sendText(id: string, text: string) {
  const body = text.trim().slice(0, 4096)
  if (!body) return
  await recordOutbound(id, { type: "text", text: body }, { body, type: "text" })
}

export async function sendTemplate(id: string, name: string, language: string, params: string[]) {
  const templates = await listTemplates()
  const t = templates.find((x) => x.name === name && x.language === language)
  if (!t) throw new Error("Template not found or not approved")
  const clean = params.slice(0, t.paramCount).map((p) => p.slice(0, 500))
  let preview = t.body
  clean.forEach((p, i) => (preview = preview.replace(`{{${i + 1}}}`, p)))
  await recordOutbound(id, { type: "template", name, language, bodyParams: clean }, { body: preview, type: "template" })
}

const MAX_UPLOAD = 16 * 1024 * 1024

export async function sendMedia(id: string, form: FormData) {
  const file = form.get("file")
  const caption = String(form.get("caption") ?? "").slice(0, 1024)
  if (!(file instanceof File) || file.size === 0) throw new Error("No file")
  if (file.size > MAX_UPLOAD) throw new Error("File is larger than 16 MB")
  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
  const isDoc = file.type === "application/pdf"
  if (!isImage && !isDoc) throw new Error("Only JPG, PNG, WEBP images or PDF documents")

  await loadScoped(id)
  // 360dialog fetches media by link, so outbound files must be publicly reachable.
  const blob = await put(`whatsapp-out/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: true,
  })
  const payload: OutboundPayload = isImage
    ? { type: "image", link: blob.url, caption: caption || undefined }
    : { type: "document", link: blob.url, filename: file.name, caption: caption || undefined }
  await recordOutbound(id, payload, {
    body: caption || null,
    type: isImage ? "image" : "document",
    blobPath: blob.url,
    mime: file.type,
    filename: file.name,
  })
}
