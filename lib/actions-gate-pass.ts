"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { notifyJobAdvisor } from "@/lib/job-notify"

export type ReleaseResult = { ok: boolean; error?: string }

/**
 * Security / advisor confirms the customer showed the gate pass and received
 * the keys. The last 4 digits of the pass must match, so keys can't be released
 * against the wrong car.
 */
export async function releaseKeys(passId: string, formData: FormData): Promise<ReleaseResult> {
  let ctx
  try {
    ctx = await requirePermission("gate_pass.release")
  } catch {
    return { ok: false, error: "You don't have permission to release keys." }
  }

  const releasedTo = String(formData.get("released_to") || "").trim().slice(0, 120)
  const code = String(formData.get("pass_code") || "").trim()
  const note = String(formData.get("release_note") || "").trim().slice(0, 500) || null
  if (!releasedTo) return { ok: false, error: "Enter who collected the keys." }

  const svc = createServiceClient()
  const { data: pass } = await svc
    .from("gate_passes")
    .select("id, job_id, pass_number, keys_released_at")
    .eq("id", passId)
    .maybeSingle()
  if (!pass) return { ok: false, error: "Gate pass not found." }
  if (pass.keys_released_at) return { ok: false, error: "Keys were already released for this pass." }
  if (!code || !String(pass.pass_number).endsWith(code) || code.length < 4) {
    return { ok: false, error: "Pass code does not match. Check the last 4 digits on the customer's pass." }
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error } = await svc
    .from("gate_passes")
    .update({ keys_released_at: nowIso, keys_released_by: ctx.userId, released_to: releasedTo, release_note: note })
    .eq("id", passId)
    .is("keys_released_at", null)
    .select("id")
  if (error) return { ok: false, error: error.message }
  if (!updated?.length) return { ok: false, error: "Keys were already released for this pass." }

  await svc.from("jobs").update({ stage: "delivered", updated_at: nowIso }).eq("id", pass.job_id).neq("stage", "delivered")

  await notifyJobAdvisor(pass.job_id, (label) => ({
    title: `Keys handed over — ${label}`,
    body: `${ctx.name ?? "Staff"} released the keys to ${releasedTo} (pass ${pass.pass_number}).`,
    type: "info",
    link: `/jobs/${pass.job_id}`,
  }))
  await logAction(ctx, "gate_pass.release", "job", pass.job_id, { pass_number: pass.pass_number, released_to: releasedTo })

  revalidatePath("/gate-pass")
  revalidatePath(`/jobs/${pass.job_id}`)
  revalidatePath("/flow")
  return { ok: true }
}
