"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext, logAction } from "@/lib/rbac/context"
import { REC_PLATFORMS, type RecPlatform } from "@/lib/ai-marketing/types"

type Result = { ok: true } | { ok: false; error: string }

async function requireOwnerAction() {
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isActive || ctx.role !== "owner") return null
  return ctx
}

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

/**
 * Approve or reject a recommendation. Approval is a decision record only —
 * nothing is executed. The database trigger enforces valid transitions and
 * blocks executed/failed while execution is disabled.
 */
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
