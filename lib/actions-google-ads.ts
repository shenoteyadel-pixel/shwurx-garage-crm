"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext, logAction } from "@/lib/rbac/context"
import { getGoogleDashboard } from "@/lib/ai-marketing/google"
import { deleteStoredRefreshToken } from "@/lib/ai-marketing/google-token"
import { runGoogleSync } from "@/lib/ai-marketing/google-sync"
import { getGoogleLeadFunnel } from "@/lib/ai-marketing/google-leads"
import { getMetaPerformance } from "@/lib/ai-marketing/meta"
import { generateGoogleReport } from "@/lib/ai-marketing/agent"

type Result = { ok: true; message: string } | { ok: false; error: string }

async function owner() {
  const ctx = await getSessionContext()
  return ctx && ctx.isActive && ctx.role === "owner" ? ctx : null
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error")

export async function syncGoogleAdsNow(): Promise<Result> {
  const ctx = await owner()
  if (!ctx) return { ok: false, error: "Owner access required." }
  const supabase = await createClient()
  const r = await runGoogleSync(supabase, "manual", { id: ctx.userId, name: ctx.name })
  await logAction(ctx, "google_ads.manual_sync", "google_ads_sync_runs", null, { ok: r.ok })
  revalidatePath("/ai-marketing/google")
  return r.ok ? { ok: true, message: r.summary } : { ok: false, error: r.summary }
}

export async function disconnectGoogleAds(): Promise<Result> {
  const ctx = await owner()
  if (!ctx) return { ok: false, error: "Owner access required." }
  try {
    await deleteStoredRefreshToken()
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
  await logAction(ctx, "google_ads.oauth_disconnected", "google_ads_oauth", "1")
  revalidatePath("/ai-marketing/google")
  return { ok: true, message: "Stored Google authorization removed." }
}

export async function generateGoogleAdsReport(period: "daily" | "weekly"): Promise<Result> {
  const ctx = await owner()
  if (!ctx) return { ok: false, error: "Owner access required." }
  if (period !== "daily" && period !== "weekly") return { ok: false, error: "Invalid period." }
  const supabase = await createClient()
  const g = await getGoogleDashboard()
  if (g.state !== "ok") {
    return { ok: false, error: g.state === "error" ? g.error : `Google Ads not connected (missing ${g.missing.join(", ")}).` }
  }
  try {
    const [meta, funnel] = await Promise.all([getMetaPerformance(), getGoogleLeadFunnel(supabase).catch(() => [])])
    const title = await generateGoogleReport(supabase, {
      period,
      google: g.data,
      meta,
      funnel,
      actor: { id: ctx.userId, name: ctx.name },
    })
    await logAction(ctx, "google_ads.report_generated", "ai_marketing_recommendation", null, { period })
    revalidatePath("/ai-marketing")
    revalidatePath("/ai-marketing/google")
    return { ok: true, message: `Saved "${title}" to the approval queue.` }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}
