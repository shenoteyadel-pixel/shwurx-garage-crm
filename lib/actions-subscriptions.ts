"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { requireSession, ctxCan, ctxCanAny, writeAudit, type SessionContext } from "@/lib/rbac/context"
import { notifyUsers } from "@/lib/attendance-notify"
import { staffWithPermission } from "@/lib/subscription-notify"
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_STATUSES,
  advanceDueDate,
  containsSensitiveData,
  isIsoDate,
  normalizeSubscriptionInput,
  type PaymentMethod,
  type SubscriptionStatus,
} from "@/lib/subscriptions"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const BUCKET = "finance-receipts"
const MAX_FILE = 10 * 1024 * 1024
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function staff(): Promise<SessionContext> {
  const ctx = await requireSession()
  if (!ctx.isStaff) throw new Error("Staff only")
  return ctx
}

async function deny(ctx: SessionContext, action: string, resourceId?: string): Promise<{ ok: false; error: string }> {
  await writeAudit({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, action: `denied:${action}`, resourceType: "subscription", resourceId, status: "denied" })
  return { ok: false, error: "You do not have permission to do this." }
}

const audit = (ctx: SessionContext, action: string, resourceId: string | null, detail?: Record<string, unknown>) =>
  writeAudit({ actorId: ctx.userId, actorName: ctx.name, actorRole: ctx.role, action, resourceType: "subscription", resourceId, detail })

function refresh(id?: string) {
  revalidatePath("/finance/subscriptions")
  if (id) revalidatePath(`/finance/subscriptions/${id}`)
}

function formToRecord(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v
  return out
}

async function validStaffIds(ids: string[]): Promise<string[]> {
  const clean = Array.from(new Set(ids.filter((i) => UUID.test(i))))
  if (!clean.length) return []
  const { data } = await createServiceClient().from("profiles").select("id").in("id", clean).neq("role", "customer")
  return (data ?? []).map((r) => r.id as string)
}

export async function saveSubscription(id: string | null, fd: FormData): Promise<Result<{ id: string }>> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.manage")) return deny(ctx, id ? "subscription_update" : "subscription_create", id ?? undefined)
  const parsed = normalizeSubscriptionInput(formToRecord(fd))
  if (!parsed.ok) return { ok: false, error: parsed.errors.join(" ") }

  const ownerRaw = String(fd.get("owner_id") ?? "")
  const [ownerId] = ownerRaw ? await validStaffIds([ownerRaw]) : [null]
  const viewerIds = await validStaffIds(fd.getAll("viewer_ids").map(String))
  const statusRaw = String(fd.get("status") ?? "active") as SubscriptionStatus
  const svc = createServiceClient()

  const row = {
    ...parsed.value,
    owner_id: ownerId ?? null,
    viewer_ids: viewerIds,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }

  if (!id) {
    const { data, error } = await svc
      .from("subscriptions")
      .insert({ ...row, status: "active", verification_source: "manual_entry", created_by: ctx.userId })
      .select("id")
      .single()
    if (error) return { ok: false, error: error.message }
    await audit(ctx, "subscription_created", data.id, { service: row.service_name, amount: row.amount, currency: row.currency })
    refresh()
    return { ok: true, id: data.id as string }
  }

  if (!UUID.test(id)) return { ok: false, error: "Invalid subscription." }
  const { data: before } = await svc.from("subscriptions").select("*").eq("id", id).maybeSingle()
  if (!before) return { ok: false, error: "Subscription not found." }
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : (before.status as SubscriptionStatus)
  // Activating an imported record is a verification step and needs approval rights.
  if (before.status === "pending_verification" && status === "active" && !ctxCan(ctx, "subscriptions.approve"))
    return { ok: false, error: "Only an approver can mark an imported subscription as verified." }

  const portalChanged = (before.billing_portal_url ?? null) !== row.billing_portal_url
  const update = {
    ...row,
    status,
    ...(portalChanged ? { portal_verified_at: null, portal_verified_by: null } : {}),
  }
  const { error } = await svc.from("subscriptions").update(update).eq("id", id)
  if (error) return { ok: false, error: error.message }
  const changed = Object.keys(update).filter(
    (k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((update as Record<string, unknown>)[k]),
  )
  await audit(ctx, "subscription_updated", id, {
    changed,
    before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
    after: Object.fromEntries(changed.map((k) => [k, (update as Record<string, unknown>)[k]])),
  })
  refresh(id)
  return { ok: true, id }
}

export async function importSubscriptions(rows: Record<string, unknown>[]): Promise<Result<{ imported: number; rejected: { line: number; errors: string[] }[] }>> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.manage")) return deny(ctx, "subscription_import")
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "Nothing to import." }
  if (rows.length > 500) return { ok: false, error: "Import at most 500 rows at a time." }

  const valid: Record<string, unknown>[] = []
  const rejected: { line: number; errors: string[] }[] = []
  rows.forEach((r, i) => {
    const res = normalizeSubscriptionInput(r)
    if (res.ok)
      valid.push({
        ...res.value,
        status: "pending_verification",
        verification_source: "csv_import",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
    else rejected.push({ line: i + 2, errors: res.errors })
  })
  if (valid.length) {
    const { error } = await createServiceClient().from("subscriptions").insert(valid)
    if (error) return { ok: false, error: error.message }
  }
  await audit(ctx, "subscriptions_imported", null, { imported: valid.length, rejected: rejected.length })
  refresh()
  return { ok: true, imported: valid.length, rejected }
}

export async function verifyBillingPortal(id: string): Promise<Result> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.approve")) return deny(ctx, "portal_verify", id)
  const svc = createServiceClient()
  const { data: sub } = await svc.from("subscriptions").select("billing_portal_url").eq("id", id).maybeSingle()
  if (!sub?.billing_portal_url) return { ok: false, error: "Add a billing portal URL first." }
  const { error } = await svc.from("subscriptions").update({ portal_verified_at: new Date().toISOString(), portal_verified_by: ctx.userId }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  await audit(ctx, "subscription_portal_verified", id, { url: sub.billing_portal_url })
  refresh(id)
  return { ok: true }
}

/** "Pay Now" never marks anything paid; it only records that the verified portal was opened. */
export async function openBillingPortal(id: string): Promise<Result<{ url: string }>> {
  const ctx = await staff()
  if (!ctxCanAny(ctx, ["subscriptions.manage", "subscriptions.approve"])) return deny(ctx, "portal_open", id)
  const { data: sub } = await createServiceClient().from("subscriptions").select("billing_portal_url, portal_verified_at, next_due_date").eq("id", id).maybeSingle()
  if (!sub?.billing_portal_url || !sub.portal_verified_at) return { ok: false, error: "This billing portal has not been verified yet." }
  await audit(ctx, "subscription_pay_now_opened", id, { url: sub.billing_portal_url, due: sub.next_due_date })
  return { ok: true, url: sub.billing_portal_url as string }
}

async function uploadFile(subscriptionId: string, file: File): Promise<{ path: string } | { error: string }> {
  if (file.size > MAX_FILE) return { error: "Files must be 10 MB or smaller." }
  if (!ALLOWED_TYPES.includes(file.type)) return { error: "Upload a PDF or an image (PNG, JPG, WEBP, HEIC)." }
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
  const path = `subscriptions/${subscriptionId}/${crypto.randomUUID()}.${ext}`
  const { error } = await createServiceClient().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  return error ? { error: error.message } : { path }
}

export async function recordSubscriptionPayment(fd: FormData): Promise<Result> {
  const ctx = await staff()
  const subscriptionId = String(fd.get("subscription_id") ?? "")
  if (!ctxCan(ctx, "subscriptions.manage")) return deny(ctx, "payment_record", subscriptionId)
  if (!UUID.test(subscriptionId)) return { ok: false, error: "Invalid subscription." }

  const svc = createServiceClient()
  const { data: sub } = await svc.from("subscriptions").select("id, service_name, next_due_date, currency, fx_rate_to_aed").eq("id", subscriptionId).maybeSingle()
  if (!sub) return { ok: false, error: "Subscription not found." }

  const amount = Number(fd.get("amount"))
  const paidOn = String(fd.get("paid_on") ?? "")
  const method = String(fd.get("method") ?? "") as PaymentMethod
  const transactionRef = String(fd.get("transaction_ref") ?? "").trim().slice(0, 120) || null
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000) || null
  const receipt = fd.get("receipt")
  const invoice = fd.get("invoice")

  if (!(amount > 0)) return { ok: false, error: "Enter the amount paid." }
  if (!isIsoDate(paidOn)) return { ok: false, error: "Enter the payment date." }
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return { ok: false, error: "Choose how it was paid." }
  if (containsSensitiveData(transactionRef) || containsSensitiveData(note))
    return { ok: false, error: "Do not enter card numbers, CVV or passwords. Use the transaction reference only." }
  const hasReceipt = receipt instanceof File && receipt.size > 0
  if (!hasReceipt && !transactionRef) return { ok: false, error: "Attach the receipt or enter the provider's transaction reference." }

  let receiptPath: string | null = null
  let invoicePath: string | null = null
  if (hasReceipt) {
    const up = await uploadFile(subscriptionId, receipt as File)
    if ("error" in up) return { ok: false, error: up.error }
    receiptPath = up.path
  }
  if (invoice instanceof File && invoice.size > 0) {
    const up = await uploadFile(subscriptionId, invoice)
    if ("error" in up) return { ok: false, error: up.error }
    invoicePath = up.path
  }

  const { data: payment, error } = await svc
    .from("subscription_payments")
    .insert({
      subscription_id: subscriptionId,
      due_date: sub.next_due_date,
      amount,
      currency: sub.currency,
      fx_rate_to_aed: sub.fx_rate_to_aed,
      paid_on: paidOn,
      method,
      transaction_ref: transactionRef,
      receipt_path: receiptPath,
      invoice_path: invoicePath,
      note,
      recorded_by: ctx.userId,
      recorded_by_name: ctx.name,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  const attachments = [
    receiptPath && { kind: "receipt", path: receiptPath, file_name: (receipt as File).name },
    invoicePath && { kind: "invoice", path: invoicePath, file_name: (invoice as File).name },
  ].filter(Boolean) as { kind: string; path: string; file_name: string }[]
  if (attachments.length)
    await svc.from("subscription_attachments").insert(
      attachments.map((a) => ({ ...a, subscription_id: subscriptionId, payment_id: payment.id, uploaded_by: ctx.userId, uploaded_by_name: ctx.name })),
    )

  await audit(ctx, "subscription_payment_recorded", subscriptionId, { payment: payment.id, amount, currency: sub.currency, due: sub.next_due_date, method })
  const approvers = await staffWithPermission("subscriptions.approve")
  await notifyUsers(
    approvers.filter((a) => a.id !== ctx.userId).map((a) => a.id),
    { title: `Confirm renewal: ${sub.service_name}`, body: `${ctx.name} recorded a ${sub.currency} ${amount.toFixed(2)} payment for the ${sub.next_due_date} renewal.`, type: "subscription", link: `/finance/subscriptions/${subscriptionId}` },
  ).catch(() => {})
  refresh(subscriptionId)
  return { ok: true }
}

export async function decideSubscriptionPayment(paymentId: string, decision: "confirmed" | "rejected", note: string): Promise<Result> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.approve")) return deny(ctx, "payment_decide", paymentId)
  if (!UUID.test(paymentId)) return { ok: false, error: "Invalid payment." }
  if (decision === "rejected" && note.trim().length < 5) return { ok: false, error: "Give a reason for rejecting the payment." }

  const svc = createServiceClient()
  const { data: pay } = await svc.from("subscription_payments").select("id, subscription_id, due_date, status, amount, currency, recorded_by").eq("id", paymentId).maybeSingle()
  if (!pay) return { ok: false, error: "Payment not found." }
  if (pay.status !== "pending_confirmation") return { ok: false, error: "This payment was already decided." }
  if (decision === "confirmed" && pay.recorded_by === ctx.userId && ctx.role !== "owner")
    return { ok: false, error: "Someone other than the person who recorded this payment must confirm it." }

  const { error } = await svc
    .from("subscription_payments")
    .update({
      status: decision,
      confirmation_source: decision === "confirmed" ? "manual" : null,
      decided_by: ctx.userId,
      decided_by_name: ctx.name,
      decided_at: new Date().toISOString(),
      decision_note: note.trim().slice(0, 1000) || null,
    })
    .eq("id", paymentId)
    .eq("status", "pending_confirmation")
  if (error) return { ok: false, error: error.message }

  let nextDue: string | null = null
  if (decision === "confirmed") {
    const { data: sub } = await svc.from("subscriptions").select("next_due_date, billing_cycle, custom_cycle_days, status").eq("id", pay.subscription_id).maybeSingle()
    // Only roll forward when this payment covers the current due date, so a late
    // confirmation of an older payment cannot skip a cycle.
    if (sub && sub.next_due_date === pay.due_date) {
      nextDue = advanceDueDate(sub.next_due_date as string, sub.billing_cycle, sub.custom_cycle_days)
      await svc
        .from("subscriptions")
        .update({ next_due_date: nextDue, resolved_due_date: null, resolved_reason: null, status: sub.status === "pending_verification" ? "active" : sub.status, updated_by: ctx.userId, updated_at: new Date().toISOString() })
        .eq("id", pay.subscription_id)
    }
  }
  await audit(ctx, `subscription_payment_${decision}`, pay.subscription_id, { payment: paymentId, amount: pay.amount, currency: pay.currency, due: pay.due_date, next_due: nextDue, note })
  refresh(pay.subscription_id)
  return { ok: true }
}

/** Explicitly stops reminders for the current due date, with a recorded reason. */
export async function resolveSubscriptionDue(id: string, action: "skip_cycle" | "pause" | "cancel", reason: string): Promise<Result> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.approve")) return deny(ctx, `subscription_${action}`, id)
  if (reason.trim().length < 10) return { ok: false, error: "Explain the reason in at least 10 characters." }
  const svc = createServiceClient()
  const { data: sub } = await svc.from("subscriptions").select("next_due_date, status").eq("id", id).maybeSingle()
  if (!sub) return { ok: false, error: "Subscription not found." }
  const update =
    action === "skip_cycle"
      ? { resolved_due_date: sub.next_due_date, resolved_reason: reason.trim() }
      : { status: action === "pause" ? "paused" : "cancelled", resolved_reason: reason.trim() }
  const { error } = await svc.from("subscriptions").update({ ...update, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  await audit(ctx, `subscription_${action}`, id, { due: sub.next_due_date, previous_status: sub.status, reason: reason.trim() })
  refresh(id)
  return { ok: true }
}

export async function reactivateSubscription(id: string): Promise<Result> {
  const ctx = await staff()
  if (!ctxCan(ctx, "subscriptions.approve")) return deny(ctx, "subscription_reactivate", id)
  const { error } = await createServiceClient().from("subscriptions").update({ status: "active", resolved_reason: null, updated_by: ctx.userId, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) return { ok: false, error: error.message }
  await audit(ctx, "subscription_reactivated", id)
  refresh(id)
  return { ok: true }
}

export async function uploadSubscriptionAttachment(fd: FormData): Promise<Result> {
  const ctx = await staff()
  const subscriptionId = String(fd.get("subscription_id") ?? "")
  if (!ctxCan(ctx, "subscriptions.manage")) return deny(ctx, "attachment_upload", subscriptionId)
  if (!UUID.test(subscriptionId)) return { ok: false, error: "Invalid subscription." }
  const file = fd.get("file")
  const kindRaw = String(fd.get("kind") ?? "invoice")
  const kind = ["invoice", "receipt", "contract", "other"].includes(kindRaw) ? kindRaw : "other"
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a file." }
  const up = await uploadFile(subscriptionId, file)
  if ("error" in up) return { ok: false, error: up.error }
  const { error } = await createServiceClient()
    .from("subscription_attachments")
    .insert({ subscription_id: subscriptionId, kind, path: up.path, file_name: file.name.slice(0, 200), uploaded_by: ctx.userId, uploaded_by_name: ctx.name })
  if (error) return { ok: false, error: error.message }
  await audit(ctx, "subscription_attachment_uploaded", subscriptionId, { kind, file: file.name })
  refresh(subscriptionId)
  return { ok: true }
}

/** Short-lived signed link, only for files on a subscription the caller can see under RLS. */
export async function getSubscriptionFileUrl(attachmentId: string): Promise<Result<{ url: string }>> {
  const ctx = await staff()
  if (!UUID.test(attachmentId)) return { ok: false, error: "Invalid file." }
  const supabase = await createClient()
  const { data: att } = await supabase.from("subscription_attachments").select("path, subscription_id").eq("id", attachmentId).maybeSingle()
  if (!att) return deny(ctx, "attachment_view", attachmentId)
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUrl(att.path as string, 300)
  if (error || !data) return { ok: false, error: error?.message ?? "Could not open the file." }
  await audit(ctx, "subscription_attachment_viewed", att.subscription_id as string, { attachment: attachmentId })
  return { ok: true, url: data.signedUrl }
}
