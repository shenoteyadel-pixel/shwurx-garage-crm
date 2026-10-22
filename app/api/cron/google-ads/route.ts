import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runGoogleSync } from "@/lib/ai-marketing/google-sync"
import { getGoogleLeadFunnel } from "@/lib/ai-marketing/google-leads"
import { getMetaPerformance } from "@/lib/ai-marketing/meta"
import { generateGoogleReport } from "@/lib/ai-marketing/agent"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Daily read-only sync + monitoring; AI report daily, plus a weekly report on Mondays (Dubai). */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = createServiceClient()
  const sync = await runGoogleSync(supabase, "cron", { id: null, name: "Scheduled sync" })
  if (!sync.ok || !sync.dashboard) return NextResponse.json({ ok: false, summary: sync.summary })

  const reports: string[] = []
  const errors: string[] = []
  const weekday = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Dubai", weekday: "short" })
  const periods: ("daily" | "weekly")[] = weekday === "Mon" ? ["daily", "weekly"] : ["daily"]
  const [meta, funnel] = await Promise.all([getMetaPerformance(), getGoogleLeadFunnel(supabase).catch(() => [])])
  for (const period of periods) {
    try {
      reports.push(
        await generateGoogleReport(supabase, {
          period,
          google: sync.dashboard,
          meta,
          funnel,
          actor: { id: null, name: "AI Marketing Manager (scheduled)" },
        }),
      )
    } catch (e) {
      errors.push(`${period}: ${e instanceof Error ? e.message : "failed"}`)
    }
  }
  return NextResponse.json({ ok: true, summary: sync.summary, reports, errors })
}
