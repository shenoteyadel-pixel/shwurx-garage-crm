import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { STAGE_ORDER, STAGE_MAP, type Stage } from "@/lib/constants"
import type { Role } from "@/lib/rbac/roles"

export type RequiredCheck = "complaint" | "diagnosis" | "technician" | "qc_passed"

export const CHECK_LABELS: Record<RequiredCheck, string> = {
  complaint: "Customer complaint is recorded",
  diagnosis: "Diagnosis is recorded",
  technician: "A technician is assigned",
  qc_passed: "Quality control has passed",
}

/** Checks that no override can skip, whatever the role. */
const HARD_CHECKS: RequiredCheck[] = ["qc_passed"]

export const OVERRIDE_ROLES: Role[] = ["owner", "general_manager"]
export const MIN_OVERRIDE_REASON = 10

export interface StageRule {
  stage: Stage
  sla_hours: number
  owner_role: string | null
  required_checks: RequiredCheck[]
  next_action: string | null
}

export type TransitionSource = "manual" | "car_flow" | "payment" | "quotation" | "approval" | "system"

export interface TransitionInput {
  jobId: string
  toStage: Stage
  actorId: string
  actorRole: Role
  source: TransitionSource
  reason?: string | null
  override?: boolean
  extraPatch?: Record<string, unknown>
}

export type TransitionResult =
  | { ok: true; fromStage: Stage | null }
  | {
      ok: false
      error: string
      missing?: { check: RequiredCheck; label: string; overridable: boolean }[]
      canOverride?: boolean
    }

type JobRow = {
  id: string
  stage: Stage
  complaint: string | null
  diagnosis: string | null
  technician_id: string | null
  advisor_id: string | null
  qc_status: string | null
  stage_entered_at: string | null
}

export async function getStageRules(): Promise<Map<Stage, StageRule>> {
  const svc = createServiceClient()
  const { data } = await svc.from("workflow_stage_rules").select("stage, sla_hours, owner_role, required_checks, next_action")
  return new Map((data ?? []).map((r) => [r.stage as Stage, r as StageRule]))
}

async function evaluateChecks(job: JobRow, checks: RequiredCheck[]): Promise<RequiredCheck[]> {
  const failed: RequiredCheck[] = []
  for (const check of checks) {
    if (check === "complaint" && !job.complaint?.trim()) failed.push(check)
    if (check === "diagnosis" && !job.diagnosis?.trim()) failed.push(check)
    if (check === "qc_passed" && job.qc_status !== "passed") failed.push(check)
    if (check === "technician" && !job.technician_id) {
      const svc = createServiceClient()
      const { count } = await svc
        .from("job_technicians")
        .select("user_id", { count: "exact", head: true })
        .eq("job_id", job.id)
      if (!count) failed.push(check)
    }
  }
  return failed
}

function ownerFor(rule: StageRule | undefined, job: Pick<JobRow, "technician_id" | "advisor_id">) {
  if (rule?.owner_role === "technician") return job.technician_id
  if (rule?.owner_role === "service_advisor") return job.advisor_id
  return null
}

function trackingPatch(rule: StageRule | undefined, job: Pick<JobRow, "technician_id" | "advisor_id">, now: Date) {
  const sla = rule?.sla_hours ?? 0
  return {
    stage_entered_at: now.toISOString(),
    stage_due_at: sla > 0 ? new Date(now.getTime() + sla * 3600_000).toISOString() : null,
    stage_owner_id: ownerFor(rule, job),
    stage_status: "pending",
    blocked_reason: null,
    next_action: rule?.next_action ?? null,
  }
}

/**
 * The single path for moving a job between stages. Forward moves must satisfy
 * the target stage's required checks. Owners and general managers can override
 * the soft checks with a written reason, but never the QC gate. The customer
 * approval gate is enforced separately by the caller (work authorization).
 */
export async function transitionJobStage(input: TransitionInput): Promise<TransitionResult> {
  const svc = createServiceClient()
  const { data: job, error: loadErr } = await svc
    .from("jobs")
    .select("id, stage, complaint, diagnosis, technician_id, advisor_id, qc_status, stage_entered_at")
    .eq("id", input.jobId)
    .maybeSingle<JobRow>()
  if (loadErr || !job) return { ok: false, error: "Job not found." }

  const fromStage = job.stage
  const rules = await getStageRules()
  const rule = rules.get(input.toStage)
  const isForward = STAGE_ORDER.indexOf(input.toStage) > STAGE_ORDER.indexOf(fromStage)

  let overriddenChecks: RequiredCheck[] = []
  if (isForward && rule) {
    const failed = await evaluateChecks(job, rule.required_checks ?? [])
    if (failed.length) {
      const canOverride = OVERRIDE_ROLES.includes(input.actorRole)
      const hardFailed = failed.filter((c) => HARD_CHECKS.includes(c))
      const reason = input.reason?.trim() ?? ""
      const overrideAccepted =
        input.override && canOverride && hardFailed.length === 0 && reason.length >= MIN_OVERRIDE_REASON
      if (!overrideAccepted) {
        const missing = failed.map((check) => ({
          check,
          label: CHECK_LABELS[check],
          overridable: !HARD_CHECKS.includes(check),
        }))
        let error = `Can't move to ${STAGE_MAP[input.toStage].label}: ${missing.map((m) => m.label.toLowerCase()).join(", ")} is required.`
        if (input.override && reason.length < MIN_OVERRIDE_REASON) {
          error = `Override reason must be at least ${MIN_OVERRIDE_REASON} characters.`
        } else if (input.override && hardFailed.length) {
          error = "Quality control must pass before this move. It can't be overridden."
        }
        return { ok: false, error, missing, canOverride: canOverride && hardFailed.length === 0 }
      }
      overriddenChecks = failed
    }
  }

  const now = new Date()
  const { error: updErr } = await svc
    .from("jobs")
    .update({
      stage: input.toStage,
      updated_at: now.toISOString(),
      ...(fromStage !== input.toStage ? trackingPatch(rule, job, now) : {}),
      ...input.extraPatch,
    })
    .eq("id", input.jobId)
  if (updErr) return { ok: false, error: updErr.message }

  if (fromStage !== input.toStage) {
    await recordStageEvent({
      jobId: input.jobId,
      fromStage,
      toStage: input.toStage,
      actorId: input.actorId,
      actorRole: input.actorRole,
      source: input.source,
      reason: input.reason?.trim() || null,
      overrideChecks: overriddenChecks,
      stageEnteredAt: job.stage_entered_at,
    })
  }
  return { ok: true, fromStage }
}

/**
 * For automatic moves done elsewhere (quotation built, approval re-requested):
 * stamps stage tracking and writes the history row. Call after the stage
 * column has been updated.
 */
export async function syncStageTracking(opts: {
  jobId: string
  fromStage: Stage | null
  toStage: Stage
  actorId: string | null
  actorRole: string | null
  source: TransitionSource
}) {
  try {
    const svc = createServiceClient()
    const { data: job } = await svc
      .from("jobs")
      .select("stage, technician_id, advisor_id, stage_entered_at")
      .eq("id", opts.jobId)
      .maybeSingle()
    if (!job || job.stage !== opts.toStage || opts.fromStage === opts.toStage) return
    const rules = await getStageRules()
    await svc.from("jobs").update(trackingPatch(rules.get(opts.toStage), job, new Date())).eq("id", opts.jobId)
    await recordStageEvent({ ...opts, reason: null, overrideChecks: [], stageEnteredAt: job.stage_entered_at })
  } catch {
    // History is best-effort for automatic moves; the move itself already happened.
  }
}

async function recordStageEvent(e: {
  jobId: string
  fromStage: Stage | null
  toStage: Stage
  actorId: string | null
  actorRole: string | null
  source: TransitionSource
  reason: string | null
  overrideChecks: RequiredCheck[]
  stageEnteredAt: string | null
}) {
  const svc = createServiceClient()
  const seconds = e.stageEnteredAt
    ? Math.max(0, Math.round((Date.now() - new Date(e.stageEnteredAt).getTime()) / 1000))
    : null
  await svc.from("job_stage_events").insert({
    job_id: e.jobId,
    from_stage: e.fromStage,
    to_stage: e.toStage,
    actor_id: e.actorId,
    actor_role: e.actorRole,
    source: e.source,
    reason: e.reason,
    override: e.overrideChecks.length > 0,
    override_checks: e.overrideChecks.length ? e.overrideChecks : null,
    seconds_in_from_stage: seconds,
  })
}
