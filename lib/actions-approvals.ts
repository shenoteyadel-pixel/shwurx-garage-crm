"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/rbac/context"
import { VAT_RATE } from "@/lib/constants"
import { appBaseUrl } from "@/lib/account-links"
import { sendEmail, approvalRequestEmail } from "@/lib/email"
import { notifyByPermission } from "@/lib/actions-notifications"
import { buildApprovalMessage, waMeLink } from "@/lib/whatsapp"
import { revalidatePath } from "next/cache"

/* =============================================================================
   Per-item, legally-signed approval engine.

   Every request freezes an immutable JSON snapshot of the exact line items,
   prices and VAT mode the customer saw. Decisions + signature are captured
   against that snapshot so a later quotation edit can never rewrite history.
   Runs alongside the legacy whole-quote flow (mode = 'whole').
============================================================================= */

export type ApprovalMode = "per_item" | "whole"
export type ApprovalKind = "quotation" | "additional_work"

type SnapshotItem = {
  key: string
  kind: "part" | "labor"
  name: string
  part_number: string | null
  detail: string | null
  category: string | null
  recommendation: "required" | "recommended" | "optional"
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  net: number // pre-VAT taxable base — RPC sums this and adds VAT on top
  vat: number
  gross: number
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Compute the pre-VAT net, VAT portion and gross for one raw item row.
function lineFor(
  row: {
    kind: string
    quantity: number | null
    unit_price: number | null
    labour_hours: number | null
    labour_rate: number | null
    discount: number | null
  },
  vatRate: number,
  inclusive: boolean,
) {
  const kind = row.kind === "labor" || row.kind === "service" ? "labor" : "part"
  const qty = Number(row.quantity) || 0
  const unit = Number(row.unit_price) || 0
  const hours = Number(row.labour_hours) || 0
  const rate = Number(row.labour_rate) || 0
  const discount = Number(row.discount) || 0
  const grossBase = kind === "labor" ? (hours > 0 ? hours * rate : rate) : qty * unit
  const base = Math.max(0, grossBase - discount)
  if (inclusive) {
    const net = base / (1 + vatRate / 100)
    return { net: round2(net), vat: round2(base - net), gross: round2(base) }
  }
  const vat = (base * vatRate) / 100
  return { net: round2(base), vat: round2(vat), gross: round2(base + vat) }
}

/**
 * Build the immutable snapshot from the job's current active quotation.
 * Returns null when there is nothing quotable.
 */
async function buildQuotationSnapshot(
  svc: ReturnType<typeof createServiceClient>,
  jobId: string,
): Promise<{
  quotationId: string
  vatRate: number
  vatInclusive: boolean
  items: SnapshotItem[]
  subtotal: number
  vatAmount: number
  total: number
} | null> {
  const { data: quotation } = await svc
    .from("quotations")
    .select(
      "id, vat_rate, vat_inclusive, quotation_items(kind, name, part_number, detail, description, quantity, unit_price, labour_hours, labour_rate, discount, category, recommendation, sort_order)",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!quotation) return null
  const rawItems = [...((quotation.quotation_items as any[]) ?? [])].sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )
  if (!rawItems.length) return null

  const vatRate = Number(quotation.vat_rate ?? VAT_RATE)
  const vatInclusive = Boolean(quotation.vat_inclusive)

  const items: SnapshotItem[] = rawItems.map((i, idx) => {
    const { net, vat, gross } = lineFor(i, vatRate, vatInclusive)
    return {
      key: `it-${idx}`,
      kind: (i.kind === "labor" || i.kind === "service" ? "labor" : "part") as "part" | "labor",
      name: i.name || i.description || "Item",
      part_number: i.part_number || null,
      detail: i.detail || null,
      category: i.category || null,
      recommendation: (i.recommendation || "required") as SnapshotItem["recommendation"],
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      labour_hours: Number(i.labour_hours) || 0,
      labour_rate: Number(i.labour_rate) || 0,
      discount: Number(i.discount) || 0,
      net,
      vat,
      gross,
    }
  })

  const subtotal = round2(items.reduce((s, i) => s + i.net, 0))
  const vatAmount = round2(items.reduce((s, i) => s + i.vat, 0))
  const total = round2(subtotal + vatAmount)
  return { quotationId: quotation.id as string, vatRate, vatInclusive, items, subtotal, vatAmount, total }
}

/**
 * Freeze a new signed approval request for the job's current quotation and
 * return its shareable link. Supersedes any earlier pending request of the
 * same kind and bumps the version so the customer always sees the latest.
 */
export async function createApprovalRequest(
  jobId: string,
  opts: {
    mode?: ApprovalMode
    expiresInDays?: number
    sendVia?: "email" | "none"
  } = {},
): Promise<{ ok: boolean; token?: string; url?: string; emailed?: boolean; error?: string }> {
  const ctx = await requirePermission("quotations.edit")
  const svc = createServiceClient()

  const snap = await buildQuotationSnapshot(svc, jobId)
  if (!snap) return { ok: false, error: "no_quotation" }

  const mode: ApprovalMode = opts.mode ?? "per_item"

  // Supersede prior pending quotation requests + find the next version.
  await svc
    .from("approval_requests")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("kind", "quotation")
    .eq("status", "pending")

  const { data: last } = await svc
    .from("approval_requests")
    .select("version")
    .eq("job_id", jobId)
    .eq("kind", "quotation")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = Number(last?.version ?? 0) + 1

  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86400_000).toISOString()
    : null

  const { data: inserted, error } = await svc
    .from("approval_requests")
    .insert({
      job_id: jobId,
      quotation_id: snap.quotationId,
      version,
      kind: "quotation",
      mode,
      status: "pending",
      title: mode === "whole" ? "Quotation approval" : "Repair quotation",
      snapshot: { items: snap.items },
      vat_rate: snap.vatRate,
      vat_inclusive: snap.vatInclusive,
      subtotal: snap.subtotal,
      vat_amount: snap.vatAmount,
      total: snap.total,
      sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      created_by: ctx.userId,
    })
    .select("id, token")
    .single()
  if (error || !inserted) return { ok: false, error: error?.message ?? "insert_failed" }

  // Keep the legacy job flags in sync so existing dashboards/badges still work.
  await svc
    .from("jobs")
    .update({ stage: "customer_approval", approval_status: "pending", updated_at: new Date().toISOString() })
    .eq("id", jobId)

  const url = `${appBaseUrl()}/approve/r/${inserted.token}`
  let emailed = false
  if ((opts.sendVia ?? "email") === "email") {
    emailed = await emailApprovalLink(svc, jobId, inserted.token as string, snap.total, snap.items.length, false)
  }

  revalidatePath(`/jobs/${jobId}`)
  return { ok: true, token: inserted.token as string, url, emailed }
}

/**
 * Create a mid-repair additional-work request from ad-hoc items (not tied to
 * the main quotation). Each item is priced with the job's default VAT mode.
 */
export async function createAdditionalWorkRequest(
  jobId: string,
  payload: {
    title: string
    vatInclusive?: boolean
    vatRate?: number
    items: {
      kind: "part" | "labor"
      name: string
      part_number?: string
      detail?: string
      category?: string
      recommendation?: "required" | "recommended" | "optional"
      quantity?: number
      unit_price?: number
      labour_hours?: number
      labour_rate?: number
      discount?: number
    }[]
  },
): Promise<{ ok: boolean; token?: string; url?: string; emailed?: boolean; error?: string }> {
  const ctx = await requirePermission("quotations.edit")
  const svc = createServiceClient()

  const vatRate = Number.isFinite(payload.vatRate) ? Number(payload.vatRate) : VAT_RATE
  const inclusive = Boolean(payload.vatInclusive)
  const clean = payload.items.filter((i) => (i.name || "").trim() || (i.detail || "").trim())
  if (!clean.length) return { ok: false, error: "no_items" }

  const items: SnapshotItem[] = clean.map((i, idx) => {
    const { net, vat, gross } = lineFor(
      {
        kind: i.kind,
        quantity: i.quantity ?? 0,
        unit_price: i.unit_price ?? 0,
        labour_hours: i.labour_hours ?? 0,
        labour_rate: i.labour_rate ?? 0,
        discount: i.discount ?? 0,
      },
      vatRate,
      inclusive,
    )
    return {
      key: `aw-${idx}`,
      kind: i.kind,
      name: (i.name || "").trim() || "Additional item",
      part_number: i.part_number?.trim() || null,
      detail: i.detail?.trim() || null,
      category: i.category?.trim() || null,
      recommendation: i.recommendation || "recommended",
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      labour_hours: Number(i.labour_hours) || 0,
      labour_rate: Number(i.labour_rate) || 0,
      discount: Number(i.discount) || 0,
      net,
      vat,
      gross,
    }
  })

  const subtotal = round2(items.reduce((s, i) => s + i.net, 0))
  const vatAmount = round2(items.reduce((s, i) => s + i.vat, 0))
  const total = round2(subtotal + vatAmount)

  const { data: last } = await svc
    .from("approval_requests")
    .select("version")
    .eq("job_id", jobId)
    .eq("kind", "additional_work")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = Number(last?.version ?? 0) + 1

  const { data: inserted, error } = await svc
    .from("approval_requests")
    .insert({
      job_id: jobId,
      version,
      kind: "additional_work",
      mode: "per_item",
      status: "pending",
      title: payload.title?.trim() || "Additional work",
      snapshot: { items },
      vat_rate: vatRate,
      vat_inclusive: inclusive,
      subtotal,
      vat_amount: vatAmount,
      total,
      sent_at: new Date().toISOString(),
      created_by: ctx.userId,
    })
    .select("id, token")
    .single()
  if (error || !inserted) return { ok: false, error: error?.message ?? "insert_failed" }

  const url = `${appBaseUrl()}/approve/r/${inserted.token}`
  const emailed = await emailApprovalLink(svc, jobId, inserted.token as string, total, items.length, true)

  revalidatePath(`/jobs/${jobId}`)
  return { ok: true, token: inserted.token as string, url, emailed }
}

export type JobApproval = {
  id: string
  token: string
  version: number
  kind: ApprovalKind
  mode: ApprovalMode
  status: string
  title: string | null
  itemCount: number
  total: number
  approvedTotal: number | null
  signerName: string | null
  sentAt: string | null
  decidedAt: string | null
}

/** List all approval requests for a job (newest first), for the staff panel + document center. */
export async function getJobApprovals(jobId: string): Promise<JobApproval[]> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("approval_requests")
    .select(
      "id, token, version, kind, mode, status, title, snapshot, total, approved_total, signer_name, sent_at, decided_at, created_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    token: r.token,
    version: Number(r.version ?? 1),
    kind: r.kind,
    mode: r.mode,
    status: r.status,
    title: r.title,
    itemCount: Array.isArray(r.snapshot?.items) ? r.snapshot.items.length : 0,
    total: Number(r.total ?? 0),
    approvedTotal: r.approved_total == null ? null : Number(r.approved_total),
    signerName: r.signer_name,
    sentAt: r.sent_at,
    decidedAt: r.decided_at,
  }))
}

/** Re-send the email for an existing pending request without changing the snapshot. */
export async function resendApprovalEmail(
  requestId: string,
): Promise<{ ok: boolean; emailed?: boolean; error?: string }> {
  await requirePermission("quotations.edit")
  const svc = createServiceClient()
  const { data: req } = await svc
    .from("approval_requests")
    .select("id, job_id, token, total, kind, status, snapshot")
    .eq("id", requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: "not_found" }
  if (req.status !== "pending") return { ok: false, error: "not_pending" }

  const itemCount = Array.isArray((req.snapshot as any)?.items) ? (req.snapshot as any).items.length : 0
  const emailed = await emailApprovalLink(
    svc,
    req.job_id as string,
    req.token as string,
    Number(req.total),
    itemCount,
    req.kind === "additional_work",
  )
  await svc.from("approval_requests").update({ sent_at: new Date().toISOString() }).eq("id", requestId)
  return { ok: true, emailed }
}

/**
 * Build a WhatsApp deep link (wa.me) pre-filled with the approval message and
 * the versioned /approve/r/<token> link for a specific approval request. The
 * staff panel opens this so the advisor can send from their own WhatsApp.
 */
export async function getApprovalWhatsAppLink(
  requestId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requirePermission("quotations.edit")
  const svc = createServiceClient()

  const { data: req } = await svc
    .from("approval_requests")
    .select("id, job_id, token, total")
    .eq("id", requestId)
    .maybeSingle()
  if (!req) return { ok: false, error: "not_found" }

  const { data: job } = await svc
    .from("jobs")
    .select("job_number, customer_name, customer_mobile, vehicle_make, vehicle_model")
    .eq("id", req.job_id)
    .maybeSingle()
  if (!job) return { ok: false, error: "no_job" }
  if (!job.customer_mobile) return { ok: false, error: "no_mobile" }

  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "your vehicle"
  const link = `${appBaseUrl()}/approve/r/${req.token}`
  const message = buildApprovalMessage({
    customerName: job.customer_name || "there",
    jobNumber: String(job.job_number ?? ""),
    vehicle,
    total: `AED ${Number(req.total).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    link,
  })
  return { ok: true, url: waMeLink(job.customer_mobile as string, message) }
}

// Shared email sender — resolves the customer + vehicle and dispatches via Resend.
async function emailApprovalLink(
  svc: ReturnType<typeof createServiceClient>,
  jobId: string,
  token: string,
  total: number,
  itemCount: number,
  isAdditional: boolean,
): Promise<boolean> {
  const { data: job } = await svc
    .from("jobs")
    .select("job_number, vehicle_make, vehicle_model, vehicle_year, customers(full_name, email)")
    .eq("id", jobId)
    .maybeSingle()
  if (!job) return false
  const customer = (job.customers as any) ?? {}
  const email = customer.email as string | undefined
  if (!email) return false

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "your vehicle"
  const url = `${appBaseUrl()}/approve/r/${token}`
  const res = await sendEmail({
    to: email,
    subject: isAdditional
      ? `Additional work approval — ${job.job_number}`
      : `Your quotation is ready — ${job.job_number}`,
    html: approvalRequestEmail({
      name: customer.full_name || "there",
      vehicle,
      jobNumber: String(job.job_number ?? ""),
      itemCount,
      total: `AED ${total.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      url,
      isAdditional,
    }),
    idempotencyKey: `approval-${token}`,
  })
  return res.sent
}

/**
 * Staff-side notification that a customer has responded. Called from the public
 * submit route after the RPC records the signed decision.
 */
export async function notifyApprovalDecision(jobId: string, status: string) {
  const svc = createServiceClient()
  const { data: job } = await svc.from("jobs").select("job_number").eq("id", jobId).maybeSingle()
  const jobNo = job?.job_number ?? "a job"

  // Reflect the outcome on the legacy job flags (approved/partial => approved gate).
  const approvalStatus = status === "rejected" ? "rejected" : "approved"
  await svc
    .from("jobs")
    .update({ approval_status: approvalStatus, updated_at: new Date().toISOString() })
    .eq("id", jobId)

  const label =
    status === "approved"
      ? "approved the quotation"
      : status === "partial"
        ? "approved part of the quotation"
        : status === "rejected"
          ? "declined the quotation"
          : "responded to the quotation"

  await notifyByPermission("quotations.view", {
    title: `Customer ${label}`,
    body: `Job ${jobNo}: the customer has signed and submitted their decision.`,
    type: "approval",
    link: `/jobs/${jobId}`,
  })
  revalidatePath(`/jobs/${jobId}`)
}
