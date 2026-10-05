"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { canMutateCms, PREVIEW_MUTATION_MESSAGE } from "@/lib/website/env"
import { normalizeDocument } from "@/lib/website/normalize"
import { readDocumentRow, readRevision } from "@/lib/website/store"
import { onlyAnalyticsChanged, planAnalyticsPublish } from "@/lib/website/analytics-publish"
import type { AnalyticsIssue } from "@/lib/website/analytics"

type Result =
  | { ok: true; draftVersion: number; liveRevisionId: number }
  | { ok: false; error: string; issues?: AnalyticsIssue[] }

/**
 * Marketing-only analytics publish. Needs `marketing.manage` and nothing from
 * the website permissions. It patches ONLY the analytics block of the draft
 * (revision-checked through website_save_draft) and creates a published
 * revision from the current live document with the new analytics. Content
 * drafts are neither read back to the caller nor published.
 */
export async function publishAnalyticsConfig(
  analytics: unknown,
  expectedDraftVersion: number,
  expectedLiveRevisionId: number,
  note: string,
): Promise<Result> {
  const ctx = await requirePermission("marketing.manage")
  if (!canMutateCms()) return { ok: false, error: PREVIEW_MUTATION_MESSAGE }

  const { available, row } = await readDocumentRow()
  if (!available || !row) return { ok: false, error: "The Website Center is not initialised yet." }
  const liveRevisionId = row.published_revision_id
  const live = liveRevisionId ? await readRevision(liveRevisionId) : null

  const plan = planAnalyticsPublish(
    { analytics, expectedDraftVersion, expectedLiveRevisionId },
    {
      draft: normalizeDocument(row.draft),
      draftVersion: row.draft_version,
      live: live ? normalizeDocument(live) : null,
      liveRevisionId,
    },
  )
  if (!plan.ok) return { ok: false, error: plan.error, issues: plan.issues }
  if (!onlyAnalyticsChanged(normalizeDocument(row.draft), plan.draft)) return { ok: false, error: "Refused: change was not analytics-only." }

  const svc = createServiceClient()
  const saved = await svc.rpc("website_save_draft", {
    p_expected_version: row.draft_version,
    p_draft: plan.draft,
    p_user: ctx.userId,
    p_user_name: ctx.name,
  })
  const s = saved.data as { ok: boolean; version?: number } | null
  if (saved.error || !s?.ok || !s.version) {
    return { ok: false, error: "The website draft changed while publishing. Reload, then publish again." }
  }

  const { data: rev, error: revErr } = await svc
    .from("website_revisions")
    .insert({
      document: plan.live,
      draft_version: s.version,
      kind: "published",
      note: `Analytics: ${note.slice(0, 450) || "settings updated"}`,
      created_by: ctx.userId,
      created_by_name: ctx.name,
    })
    .select("id")
    .single()
  if (revErr || !rev) return { ok: false, error: "Could not record the analytics revision." }

  // Compare-and-swap on the live pointer: lose cleanly if someone published meanwhile.
  const { data: swapped } = await svc
    .from("website_documents")
    .update({ published_revision_id: rev.id })
    .eq("id", 1)
    .eq("published_revision_id", liveRevisionId!)
    .select("id")
  if (!swapped?.length) {
    await svc.from("website_revisions").delete().eq("id", rev.id)
    return {
      ok: false,
      error: "The live website changed while publishing. Your settings are saved in the draft; reload and publish again.",
    }
  }

  await logAction(ctx, "website.analytics_publish", "website", String(rev.id), {
    enabled: plan.config.enabled,
    owner: plan.config.owner,
  })
  revalidatePath("/", "layout")
  revalidatePath("/marketing")
  return { ok: true, draftVersion: s.version, liveRevisionId: rev.id }
}
