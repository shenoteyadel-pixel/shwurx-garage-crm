"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext, logAction } from "@/lib/rbac/context"
import {
  CHECK_TYPES,
  LIVE_EXECUTION_ENV,
  REC_PLATFORMS,
  type CheckStatus,
  type CheckType,
  type ProposedAction,
  type RecPlatform,
} from "@/lib/ai-marketing/types"
import { checkMeta, executeMetaAction, getMetaPerformance, metaAccountId, metaSnapshot } from "@/lib/ai-marketing/meta"
import {
  checkGoogle,
  executeGoogleAction,
  getGooglePerformance,
  googleCustomerId,
  googleSnapshot,
} from "@/lib/ai-marketing/google"
import { computeAttribution } from "@/lib/ai-marketing/attribution"
import { checkAi, generateRecommendations } from "@/lib/ai-marketing/agent"

type Result = { ok: true } | { ok: false; error: string }
type CheckResult = { ok: true; status: CheckStatus; summary: string } | { ok: false; error: string }

async function requireOwnerAction() {
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isActive || ctx.role !== "owner") return null
  return ctx
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error")

/**
 * Saves a DRAFT recommendation (status pending). This never contacts an ad
 * platform — it is a record for the owner to review.
 */
export async function createDraftRecommendation(input: {
  platform: string
  title: string
  summary: string
}): Promise<Result> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }

  const platform = (REC_PLATFORMS as readonly string[]).includes(input.platform)
    ? (input.platform as RecPlatform)
    : "general"
  const title = input.title.trim()
  const summary = input.summary.trim()
  if (title.length < 3 || title.length > 200) return { ok: false, error: "Title must be 3–200 characters." }
  if (summary.length > 4000) return { ok: false, error: "Summary is too long." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_marketing_recommendations")
    .insert({
      platform,
      title,
      summary: summary || null,
      source: "manual",
      status: "pending",
      created_by: ctx.userId,
      created_by_name: ctx.name,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, "ai_marketing.recommendation_created", "ai_marketing_recommendation", data.id, { platform })
  revalidatePath("/ai-marketing")
  return { ok: true }
}

/** Approve or reject. Approval is a decision record only; execution is a separate explicit step. */
export async function decideRecommendation(input: {
  id: string
  decision: "approved" | "rejected"
  note: string
}): Promise<Result> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { ok: false, error: "Invalid decision." }
  }
  const note = input.note.trim()
  if (note.length > 2000) return { ok: false, error: "Note is too long." }

  const allowedFrom = input.decision === "approved" ? ["pending"] : ["pending", "approved"]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_marketing_recommendations")
    .update({
      status: input.decision,
      decided_by: ctx.userId,
      decided_by_name: ctx.name,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", input.id)
    .in("status", allowedFrom)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: "This recommendation was already decided." }

  await logAction(ctx, `ai_marketing.recommendation_${input.decision}`, "ai_marketing_recommendation", input.id)
  revalidatePath("/ai-marketing")
  return { ok: true }
}

/** Runs a real authenticated test for one integration and stores the result (never secrets). */
export async function runIntegrationCheck(type: string): Promise<CheckResult> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }
  if (!(CHECK_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Unknown check." }
  const checkType = type as CheckType
  const supabase = await createClient()

  let status: CheckStatus
  let summary: string
  let details: Record<string, unknown>
  try {
    if (checkType === "meta") {
      const r = await checkMeta()
      ;({ status, summary } = r)
      details = { ...r.details, canRead: r.canRead, canManage: r.canManage }
    } else if (checkType === "google") {
      const r = await checkGoogle()
      ;({ status, summary } = r)
      details = { ...r.details, canRead: r.canRead, canManage: r.canManage }
    } else if (checkType === "ai") {
      ;({ status, summary, details } = await checkAi())
    } else {
      const report = await computeAttribution(supabase, { meta: null, google: null })
      const leads = report.channels.reduce((n, c) => n + c.leads, 0)
      const linked = report.channels.reduce((n, c) => n + c.linkedLeads, 0)
      status = leads === 0 ? "limited" : "connected"
      summary =
        leads === 0
          ? `CRM readable, but no Meta/Google leads in the last ${report.days} days to attribute.`
          : `CRM attribution working: ${leads} ad leads, ${linked} linked to customers (last ${report.days} days).`
      details = { leads, linkedLeads: linked, notes: report.notes }
    }
  } catch (e) {
    status = "error"
    summary = errMsg(e)
    details = {}
  }

  const ok = status === "connected" || status === "limited"
  const { error } = await supabase.from("ai_marketing_integration_checks").insert({
    check_type: checkType,
    ok,
    status,
    summary: summary.slice(0, 1000),
    details,
    checked_by: ctx.userId,
    checked_by_name: ctx.name,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath("/ai-marketing")
  return { ok: true, status, summary }
}

/** AI agent: analyze real data and save pending drafts. Never touches ad platforms. */
export async function generateAiRecommendations(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }
  const supabase = await createClient()
  try {
    const [meta, google] = await Promise.all([getMetaPerformance(), getGooglePerformance()])
    const attribution = await computeAttribution(supabase, {
      meta: meta.state === "ok" ? meta.data.totals.spend : null,
      google: google.state === "ok" ? google.data.totals.spend : null,
    }).catch(() => null)
    const count = await generateRecommendations(supabase, {
      meta,
      google,
      attribution,
      actor: { id: ctx.userId, name: ctx.name },
    })
    await logAction(ctx, "ai_marketing.ai_generated", "ai_marketing_recommendation", null, { count })
    revalidatePath("/ai-marketing")
    return { ok: true, count }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/**
 * Per-platform publishing switch. Enabling requires a fresh live check proving
 * ads_management (Meta) / account access (Google). Live actions additionally need
 * the server env AI_MARKETING_LIVE_EXECUTION=true.
 */
export async function setPublishingEnabled(input: { platform: string; enabled: boolean }): Promise<Result> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }
  if (input.platform !== "meta" && input.platform !== "google") return { ok: false, error: "Invalid platform." }

  if (input.enabled) {
    const check = input.platform === "meta" ? await checkMeta() : await checkGoogle()
    if (!check.canManage) {
      return { ok: false, error: `Cannot enable publishing: ${check.summary}` }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("ai_marketing_execution_settings")
    .update({
      publishing_enabled: input.enabled,
      changed_by: ctx.userId,
      changed_by_name: ctx.name,
      changed_at: new Date().toISOString(),
    })
    .eq("platform", input.platform)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "ai_marketing.publishing_toggled", "ai_marketing_execution_settings", input.platform, {
    enabled: input.enabled,
  })
  revalidatePath("/ai-marketing")
  return { ok: true }
}

/**
 * Executes ONE owner-approved recommendation, only when every gate is open:
 * owner session, status approved, server env switch, per-platform DB switch,
 * live permission check. The action log's unique idempotency key prevents
 * duplicate campaigns or repeated budget changes.
 */
export async function executeApprovedRecommendation(input: { id: string; confirm: string }): Promise<Result> {
  const ctx = await requireOwnerAction()
  if (!ctx) return { ok: false, error: "Owner access required." }
  if (input.confirm !== "EXECUTE") return { ok: false, error: 'Type EXECUTE to confirm.' }

  const supabase = await createClient()
  const { data: rec, error: recErr } = await supabase
    .from("ai_marketing_recommendations")
    .select("id, platform, status, proposed_action")
    .eq("id", input.id)
    .single()
  if (recErr || !rec) return { ok: false, error: recErr?.message ?? "Recommendation not found." }
  if (rec.status !== "approved") return { ok: false, error: "Only approved recommendations can be executed." }
  if (rec.platform !== "meta" && rec.platform !== "google") return { ok: false, error: "General recommendations cannot be executed." }
  const platform = rec.platform as "meta" | "google"
  const action = ((rec.proposed_action as { action?: ProposedAction } | null)?.action ?? { kind: "none" }) as ProposedAction
  if (!action.kind || action.kind === "none") return { ok: false, error: "This recommendation has no executable action." }

  const block = async (reason: string): Promise<Result> => {
    await logAction(ctx, "ai_marketing.execution_blocked", "ai_marketing_recommendation", rec.id, { platform, reason })
    return { ok: false, error: reason }
  }
  if (process.env[LIVE_EXECUTION_ENV] !== "true") {
    return block(`Live execution is disabled on the server (${LIVE_EXECUTION_ENV} is not "true").`)
  }
  const { data: enabled } = await supabase.rpc("ai_marketing_execution_enabled", { p_platform: platform })
  if (!enabled) return block(`Publishing is switched off for ${platform === "meta" ? "Meta" : "Google"} in Settings.`)

  const check = platform === "meta" ? await checkMeta() : await checkGoogle()
  if (!check.canManage) return block(`Permission check failed: ${check.summary}`)

  let previous: Record<string, unknown> | null = null
  if (action.campaign_id) {
    try {
      previous = (platform === "meta" ? await metaSnapshot(action.campaign_id) : await googleSnapshot(action.campaign_id)) as Record<
        string,
        unknown
      >
    } catch (e) {
      return block(`Could not read current campaign values: ${errMsg(e)}`)
    }
  }

  const idempotencyKey = `rec:${rec.id}:${action.kind}`
  const { data: logRow, error: logErr } = await supabase
    .from("ai_marketing_action_log")
    .insert({
      recommendation_id: rec.id,
      platform,
      account_id: platform === "meta" ? metaAccountId() : googleCustomerId(),
      action_type: action.kind,
      idempotency_key: idempotencyKey,
      previous_values: previous,
      new_values: action,
      status: "started",
      actor_id: ctx.userId,
      actor_name: ctx.name,
    })
    .select("id")
    .single()
  if (logErr) {
    return { ok: false, error: logErr.code === "23505" ? "This action was already executed once." : logErr.message }
  }

  try {
    const apiResult =
      platform === "meta" ? await executeMetaAction(action) : await executeGoogleAction(action, idempotencyKey)
    const now = new Date().toISOString()
    await supabase
      .from("ai_marketing_action_log")
      .update({ status: "succeeded", api_result: apiResult, finished_at: now })
      .eq("id", logRow.id)
    await supabase.from("ai_marketing_recommendations").update({ status: "executed", executed_at: now }).eq("id", rec.id)
    await logAction(ctx, "ai_marketing.executed", "ai_marketing_recommendation", rec.id, { platform, kind: action.kind })
    revalidatePath("/ai-marketing")
    return { ok: true }
  } catch (e) {
    const now = new Date().toISOString()
    const message = errMsg(e).slice(0, 1000)
    await supabase
      .from("ai_marketing_action_log")
      .update({ status: "failed", api_result: { error: message }, finished_at: now })
      .eq("id", logRow.id)
    await supabase
      .from("ai_marketing_recommendations")
      .update({ status: "failed", failed_at: now, failure_reason: message })
      .eq("id", rec.id)
    await logAction(ctx, "ai_marketing.execution_failed", "ai_marketing_recommendation", rec.id, { platform })
    revalidatePath("/ai-marketing")
    return { ok: false, error: message }
  }
}
