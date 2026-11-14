"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { ctxCan, logCurrent, requirePermission } from "@/lib/rbac/context"
import {
  PART_SOURCES,
  TARGET_CATEGORIES,
  normalizeBuckets,
  progressFor,
  sumAmounts,
  type PartBuckets,
  type TargetCategory,
} from "@/lib/advisor-performance"
import { loadCollections, loadReviewRequests, loadTargets } from "@/lib/advisor-performance-data"
import { monthRange } from "@/lib/addon-month"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const UUID = /^[0-9a-f-]{36}$/i
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function refresh() {
  revalidatePath("/reports/advisor-performance")
  revalidatePath("/my-performance")
}

/* ---------------- Targets ---------------- */

export interface TargetInput {
  scope: "individual" | "team"
  userId: string | null
  category: TargetCategory
  month: string
  target: number
  commissionPercent: number
  bonusAmount: number
  note?: string
}

/** Replaces the active target. The previous version is kept and marked superseded. */
export async function saveAdvisorTarget(input: TargetInput): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  if (!MONTH.test(input.month)) return fail("Choose a valid month.")
  if (!TARGET_CATEGORIES.includes(input.category)) return fail("Unknown category.")
  if (input.scope !== "team" && input.scope !== "individual") return fail("Unknown scope.")
  const userId = input.scope === "team" ? null : input.userId
  if (input.scope === "individual" && (!userId || !UUID.test(userId))) return fail("Choose an advisor.")
  const target = num(input.target)
  const pct = num(input.commissionPercent)
  const bonus = num(input.bonusAmount)
  if (!(target >= 0) || !(pct >= 0 && pct <= 100) || !(bonus >= 0)) return fail("Enter valid, non-negative values.")

  const svc = createServiceClient()
  const month = `${input.month}-01`
  if (userId) {
    const { data: p } = await svc.from("profiles").select("role").eq("id", userId).maybeSingle()
    if (p?.role !== "service_advisor") return fail("Targets can only be set for service advisors.")
  }

  let prevQ = svc
    .from("advisor_targets")
    .select("id, target, commission_percent, bonus_amount")
    .eq("scope", input.scope)
    .eq("category", input.category)
    .eq("month", month)
    .is("superseded_at", null)
  prevQ = userId ? prevQ.eq("user_id", userId) : prevQ.is("user_id", null)
  const { data: prev } = await prevQ.maybeSingle()

  if (prev) {
    const { error } = await svc
      .from("advisor_targets")
      .update({ superseded_at: new Date().toISOString(), superseded_by: ctx.userId })
      .eq("id", prev.id)
    if (error) return fail(error.message)
  }
  const { data: row, error } = await svc
    .from("advisor_targets")
    .insert({
      scope: input.scope,
      user_id: userId,
      category: input.category,
      month,
      target,
      commission_percent: pct,
      bonus_amount: bonus,
      note: String(input.note ?? "").trim().slice(0, 300) || null,
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error) return fail(error.message)

  await logCurrent(prev ? "advisor_target.update" : "advisor_target.create", "advisor_target", row.id, {
    scope: input.scope,
    user_id: userId,
    category: input.category,
    month: input.month,
    before: prev ?? null,
    after: { target, commission_percent: pct, bonus_amount: bonus },
  })
  refresh()
  return { ok: true }
}

/* ---------------- Commission approval ---------------- */

/** Recomputes the month's figures on the server and records the approved commission. */
export async function approveAdvisorCommission(input: {
  userId: string
  month: string
  category: TargetCategory
}): Promise<Result<{ amount: number }>> {
  const ctx = await requirePermission("payroll.manage")
  if (!MONTH.test(input.month) || !UUID.test(input.userId) || !TARGET_CATEGORIES.includes(input.category))
    return fail("Invalid request.")

  const range = monthRange(input.month)
  const [targets, achieved] = await Promise.all([
    loadTargets({ fromMonth: range.from, toMonth: range.from, userId: input.userId }),
    achievedFor(input.userId, input.category, range.from, range.to),
  ])
  const rule = targets.find((t) => t.scope === "individual" && t.user_id === input.userId && t.category === input.category)
  if (!rule) return fail("No target is set for this advisor and month.")
  const p = progressFor(rule, achieved)

  const svc = createServiceClient()
  const { error } = await svc.from("advisor_commission_approvals").upsert(
    {
      user_id: input.userId,
      month: range.from,
      category: input.category,
      qualified_amount: p.achieved,
      amount: p.commission,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month,category" },
  )
  if (error) return fail(error.message)
  await logCurrent("advisor_commission.approve", "advisor_commission", input.userId, {
    month: input.month,
    category: input.category,
    qualified: p.achieved,
    amount: p.commission,
  })
  refresh()
  return { ok: true, amount: p.commission }
}

export async function revokeAdvisorCommission(input: { userId: string; month: string; category: TargetCategory }): Promise<Result> {
  await requirePermission("payroll.manage")
  if (!MONTH.test(input.month) || !UUID.test(input.userId)) return fail("Invalid request.")
  const svc = createServiceClient()
  const { error } = await svc
    .from("advisor_commission_approvals")
    .delete()
    .eq("user_id", input.userId)
    .eq("month", `${input.month}-01`)
    .eq("category", input.category)
  if (error) return fail(error.message)
  await logCurrent("advisor_commission.revoke", "advisor_commission", input.userId, input)
  refresh()
  return { ok: true }
}

async function achievedFor(userId: string, category: TargetCategory, from: string, toExclusive: string) {
  if (category === "reviews") {
    const reqs = await loadReviewRequests({ from, toExclusive, advisorId: userId })
    return reqs.filter((r) => r.verified_at).length
  }
  const { rows } = await loadCollections({ from, toExclusive, advisorId: userId })
  return sumAmounts(rows)[category]
}

/* ---------------- Settings & classification ---------------- */

export async function savePerformanceSettings(input: { googleReviewUrl: string; buckets: PartBuckets }): Promise<Result> {
  await requirePermission("settings.manage")
  const url = input.googleReviewUrl.trim()
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) return fail("The review link must start with https://")
  const buckets = normalizeBuckets(input.buckets)
  const svc = createServiceClient()
  const { error } = await svc
    .from("settings")
    .update({ google_review_url: url || null, part_source_buckets: buckets })
    .eq("id", 1)
  if (error) return fail(error.message)
  await logCurrent("performance_settings.update", "performance_settings", "1", { google_review_url: url || null, buckets })
  refresh()
  return { ok: true }
}

/** Sets genuine / OEM / aftermarket / refurbished / used on an invoice line. Invoice totals are unchanged. */
export async function classifyInvoiceLine(itemId: string, source: string): Promise<Result> {
  await requirePermission("payroll.manage")
  if (!UUID.test(itemId) || !(PART_SOURCES as readonly string[]).includes(source)) return fail("Invalid request.")
  const svc = createServiceClient()
  const { data: item } = await svc.from("invoice_items").select("kind, part_source").eq("id", itemId).maybeSingle()
  if (!item || item.kind !== "part") return fail("Only part lines can be classified.")
  const { error } = await svc.from("invoice_items").update({ part_source: source }).eq("id", itemId)
  if (error) return fail(error.message)
  await logCurrent("invoice_item.classify", "invoice_item", itemId, { before: item.part_source, after: source })
  refresh()
  return { ok: true }
}

/* ---------------- Google review requests ---------------- */

function waLink(mobile: string | null, name: string | null, url: string) {
  const digits = (mobile ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "971")
  const text =
    `Hello ${name?.trim() || "there"}, thank you for choosing SHWURX Auto Service Center. ` +
    `If you have a moment, we would appreciate your honest feedback on Google:\n${url}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/**
 * Records a review request for a paid job and returns the WhatsApp link. One request per job.
 * No incentive is offered and the message asks for honest feedback, whatever the rating.
 */
export async function recordReviewRequest(jobId: string): Promise<Result<{ link: string }>> {
  const ctx = await requirePermission("quotations.edit")
  if (!UUID.test(jobId)) return fail("Invalid job.")
  const svc = createServiceClient()
  const [{ data: job }, { data: settings }, { data: paid }] = await Promise.all([
    svc.from("jobs").select("id, advisor_id, customer_name, customer_mobile").eq("id", jobId).maybeSingle(),
    svc.from("settings").select("google_review_url").eq("id", 1).maybeSingle(),
    svc.from("invoices").select("id").eq("job_id", jobId).eq("status", "paid").limit(1).maybeSingle(),
  ])
  if (!job) return fail("Job not found.")
  if (!settings?.google_review_url) return fail("An admin needs to add the Google review link first.")
  if (!paid) return fail("Review requests can only be sent after the invoice is paid.")
  if (job.advisor_id !== ctx.userId && !ctxCan(ctx, "payroll.manage"))
    return fail("Only the job's advisor or an admin can send this request.")
  if (!job.customer_mobile) return fail("This customer has no mobile number.")

  const { data: row, error } = await svc
    .from("review_requests")
    .insert({
      job_id: job.id,
      invoice_id: paid.id,
      advisor_id: job.advisor_id,
      customer_name: job.customer_name,
      customer_mobile: job.customer_mobile,
      channel: "whatsapp",
      status: "sent",
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error) return fail(error.code === "23505" ? "A review request was already sent for this job." : error.message)
  await logCurrent("review_request.send", "review_request", row.id, { job_id: job.id })
  refresh()
  return { ok: true, link: waLink(job.customer_mobile, job.customer_name, settings.google_review_url) }
}

export async function setReviewDelivery(id: string, status: "sent" | "delivered" | "failed"): Promise<Result> {
  const ctx = await requirePermission("quotations.edit")
  if (!UUID.test(id) || !["sent", "delivered", "failed"].includes(status)) return fail("Invalid request.")
  const svc = createServiceClient()
  const { data: req } = await svc.from("review_requests").select("advisor_id").eq("id", id).maybeSingle()
  if (!req) return fail("Request not found.")
  if (req.advisor_id !== ctx.userId && !ctxCan(ctx, "payroll.manage")) return fail("Not allowed.")
  const { error } = await svc
    .from("review_requests")
    .update({ status, delivered_at: status === "delivered" ? new Date().toISOString() : null })
    .eq("id", id)
  if (error) return fail(error.message)
  await logCurrent("review_request.status", "review_request", id, { status })
  refresh()
  return { ok: true }
}

/** Only an admin can verify, and only with written evidence linking the public review to this request. */
export async function verifyReview(id: string, evidence: string): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  const note = evidence.trim().slice(0, 500)
  if (!UUID.test(id)) return fail("Invalid request.")
  if (note.length < 5) return fail("Describe the evidence (for example, reviewer name and date on Google).")
  const svc = createServiceClient()
  const { error } = await svc
    .from("review_requests")
    .update({ verified_at: new Date().toISOString(), verified_by: ctx.userId, verification_evidence: note })
    .eq("id", id)
  if (error) return fail(error.message)
  await logCurrent("review_request.verify", "review_request", id, { evidence: note })
  refresh()
  return { ok: true }
}

export async function unverifyReview(id: string): Promise<Result> {
  await requirePermission("payroll.manage")
  if (!UUID.test(id)) return fail("Invalid request.")
  const svc = createServiceClient()
  const { error } = await svc
    .from("review_requests")
    .update({ verified_at: null, verified_by: null, verification_evidence: null })
    .eq("id", id)
  if (error) return fail(error.message)
  await logCurrent("review_request.unverify", "review_request", id)
  refresh()
  return { ok: true }
}
