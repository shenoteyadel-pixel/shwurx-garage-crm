import { generateText, Output } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AttributionReport, LiveResult, PlatformPerformance } from "@/lib/ai-marketing/types"
import type { GoogleDashboard } from "@/lib/ai-marketing/google"
import type { GoogleLeadRow } from "@/lib/ai-marketing/google-leads"

/** AI Gateway model (zero-config auth on Vercel). */
export const AI_MARKETING_MODEL = process.env.AI_MARKETING_MODEL || "anthropic/claude-sonnet-4.6"

const SYSTEM = `You are the senior marketing manager for SWURX Automotive, a premium car service garage in Dubai, UAE.
Focus: service, maintenance and repair customers who own Porsche, Mercedes-Benz, BMW, Audi, Range Rover, Ferrari and Lamborghini.
Rules:
- Use ONLY the numbers in the provided data snapshot. Never invent metrics, results or claim a campaign is active unless the snapshot says so.
- If data is missing or a platform is not connected, say so and recommend what to set up or test instead of guessing.
- Budgets are daily amounts in AED. Be conservative; changes above 20% need strong evidence in the data.
- Write ad copy that is compliant with Meta and Google ad policies (no guaranteed outcomes, no misleading claims).
- Arabic text must be natural Gulf-appropriate Modern Standard Arabic.
- You only draft. The owner approves; nothing you write is published automatically.`

const recSchema = z.object({
  platform: z.enum(["meta", "google", "general"]),
  title_en: z.string().max(160),
  title_ar: z.string().max(160),
  summary_en: z.string().max(1200),
  summary_ar: z.string().max(1200),
  rationale: z.string().max(800).describe("Which data points from the snapshot justify this. Say 'no data' if none."),
  segment: z.string().max(200).describe("Target customer segment, e.g. 'Porsche owners in Dubai Hills, 3–8 year old vehicles'"),
  objective: z.string().max(80),
  targeting: z.string().max(500),
  ad_copy_en: z.string().max(600),
  ad_copy_ar: z.string().max(600),
  creative_brief: z.string().max(800),
  action: z.object({
    kind: z.enum(["none", "create_campaign", "update_budget", "set_status"]),
    campaign_id: z.string().nullable().describe("Existing campaign id from the snapshot for update_budget / set_status"),
    name: z.string().nullable(),
    objective: z.string().nullable().describe("For Meta create_campaign use OUTCOME_LEADS, OUTCOME_TRAFFIC or OUTCOME_AWARENESS"),
    daily_budget_aed: z.number().nullable(),
    status: z.enum(["PAUSED", "ACTIVE"]).nullable(),
  }),
})

function perfSummary(label: string, p: LiveResult<PlatformPerformance>) {
  if (p.state === "not_configured") return `${label}: NOT CONNECTED (missing ${p.missing.join(", ")}). No data.`
  if (p.state === "error") return `${label}: API ERROR (${p.error}). No data.`
  const d = p.data
  return `${label} account ${d.accountId} (${d.currency}), ${d.rangeLabel}: totals ${JSON.stringify(d.totals)}; campaigns: ${JSON.stringify(
    d.campaigns.slice(0, 25),
  )}`
}

export async function generateRecommendations(
  supabase: SupabaseClient,
  input: {
    meta: LiveResult<PlatformPerformance>
    google: LiveResult<PlatformPerformance>
    attribution: AttributionReport | null
    actor: { id: string | null; name: string }
  },
) {
  const { data: past } = await supabase
    .from("ai_marketing_recommendations")
    .select("platform, title, status, decision_note, failure_reason, created_at")
    .in("status", ["approved", "rejected", "executed", "failed"])
    .order("updated_at", { ascending: false })
    .limit(30)

  const snapshot = [
    `Today (Dubai): ${new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}`,
    perfSummary("Meta Ads", input.meta),
    perfSummary("Google Ads", input.google),
    `CRM attribution (last ${input.attribution?.days ?? 30} days): ${input.attribution ? JSON.stringify(input.attribution) : "unavailable"}`,
    `Owner decisions on previous recommendations (learn from approvals/rejections and their notes): ${JSON.stringify(past ?? [])}`,
  ].join("\n\n")

  const { output } = await generateText({
    model: AI_MARKETING_MODEL,
    system: SYSTEM,
    output: Output.object({ schema: z.object({ recommendations: z.array(recSchema).min(1).max(5) }) }),
    prompt: `Analyze this data snapshot and produce 3–5 prioritized recommendations, including at least one Meta vs Google comparison if both have data, and copy in English and Arabic.\n\n${snapshot}`,
  })

  const rows = output.recommendations.map((r) => ({
    platform: r.platform,
    title: r.title_en,
    summary: r.summary_en,
    source: "ai",
    status: "pending",
    created_by: input.actor.id,
    created_by_name: input.actor.name,
    proposed_action: {
      action: r.platform === "general" ? { kind: "none" } : r.action,
      content: {
        title_ar: r.title_ar,
        summary_ar: r.summary_ar,
        rationale: r.rationale,
        segment: r.segment,
        objective: r.objective,
        targeting: r.targeting,
        ad_copy_en: r.ad_copy_en,
        ad_copy_ar: r.ad_copy_ar,
        creative_brief: r.creative_brief,
      },
      model: AI_MARKETING_MODEL,
    },
  }))
  const { error } = await supabase.from("ai_marketing_recommendations").insert(rows)
  if (error) throw new Error(`Could not save recommendations: ${error.message}`)
  return rows.length
}

const googleReportSchema = z.object({
  title_en: z.string().max(160),
  title_ar: z.string().max(160),
  summary_en: z.string().max(4000).describe("The full report in plain text with short headed sections."),
  summary_ar: z.string().max(4000),
  rationale: z.string().max(1500).describe("Exact figures from the snapshot behind each conclusion."),
  wasted_spend: z.string().max(1200).describe("Campaigns/keywords/search terms spending without conversions, with AED amounts."),
  negative_keywords: z.array(z.string().max(80)).max(25).describe("Only terms that appear in the search-term data."),
  keyword_improvements: z.string().max(1200),
  cost_per_lead: z.string().max(800).describe("Google cost per conversion and per CRM lead; compare with Meta when available."),
  budget_allocation: z.string().max(1000),
  top_campaigns: z.string().max(800),
  headlines: z.array(z.string().max(30)).max(10).describe("Responsive search ad headlines, max 30 characters each."),
  descriptions: z.array(z.string().max(90)).max(4).describe("Responsive search ad descriptions, max 90 characters each."),
})

/**
 * Daily / weekly Google Ads report from real API data + CRM funnel + Meta comparison.
 * Saved as a pending recommendation with no executable action (read-only).
 */
export async function generateGoogleReport(
  supabase: SupabaseClient,
  input: {
    period: "daily" | "weekly"
    google: GoogleDashboard
    meta: LiveResult<PlatformPerformance>
    funnel: GoogleLeadRow[]
    actor: { id: string | null; name: string }
  },
) {
  const g = input.google
  const days = input.period === "daily" ? 1 : 7
  const trend = g.daily.slice(-Math.max(days * 2, 14))
  const leads = input.funnel.filter((l) => !l.duplicateOf)
  const funnel = {
    leads: leads.length,
    withGclid: leads.filter((l) => l.gclid).length,
    appointments: leads.filter((l) => l.appointmentStatus).length,
    jobs: leads.filter((l) => l.jobStatus).length,
    converted: leads.filter((l) => l.converted).length,
    revenuePaid: leads.reduce((n, l) => n + (l.invoicePaid ?? 0), 0),
    duplicatesFlagged: input.funnel.length - leads.length,
  }
  const snapshot = [
    `Today (Dubai): ${new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}. Report period: ${input.period} (focus on the last ${days} day(s), compared with the prior period).`,
    `Google Ads customer ${g.customer.id} "${g.customer.name ?? ""}" (${g.customer.currency}). 30-day totals ${g.range.from}..${g.range.to}: ${JSON.stringify(g.totals)}`,
    `Campaigns (30d): ${JSON.stringify(g.campaigns.slice(0, 30))}`,
    `Daily trend (most recent ${trend.length} days): ${JSON.stringify(trend)}`,
    `Top keywords by cost (30d): ${JSON.stringify(g.keywords.slice(0, 40))}`,
    `Top search terms by cost (30d): ${JSON.stringify(g.searchTerms.slice(0, 40))}`,
    g.notes.length ? `Data notes: ${g.notes.join("; ")}` : "",
    `CRM funnel for Google leads (90d): ${JSON.stringify(funnel)}`,
    perfSummary("Meta Ads (for comparison)", input.meta),
  ]
    .filter(Boolean)
    .join("\n\n")

  const { output } = await generateText({
    model: AI_MARKETING_MODEL,
    system: SYSTEM,
    output: Output.object({ schema: googleReportSchema }),
    prompt: `Write the ${input.period} Google Ads performance report. Analyze performance, identify wasted spend, suggest negative keywords and keyword improvements, analyze cost per lead, name high performers, recommend budget allocation, compare with Meta, and write new RSA headlines/descriptions. If a figure is zero or missing say so plainly.\n\n${snapshot}`,
  })

  const r = output
  const { error } = await supabase.from("ai_marketing_recommendations").insert({
    platform: "google",
    title: r.title_en,
    summary: r.summary_en,
    source: "ai",
    status: "pending",
    created_by: input.actor.id,
    created_by_name: input.actor.name,
    proposed_action: {
      action: { kind: "none" },
      report: { period: input.period, range: g.range, funnel },
      content: {
        title_ar: r.title_ar,
        summary_ar: r.summary_ar,
        rationale: r.rationale,
        segment: r.top_campaigns,
        objective: `${input.period} report`,
        targeting: `Negative keyword candidates: ${r.negative_keywords.join(", ") || "none"}\n\nKeyword improvements: ${r.keyword_improvements}`,
        ad_copy_en: `Headlines:\n${r.headlines.join("\n")}\n\nDescriptions:\n${r.descriptions.join("\n")}`,
        ad_copy_ar: "",
        creative_brief: `Wasted spend: ${r.wasted_spend}\n\nCost per lead: ${r.cost_per_lead}\n\nBudget allocation: ${r.budget_allocation}`,
      },
      model: AI_MARKETING_MODEL,
    },
  })
  if (error) throw new Error(`Could not save report: ${error.message}`)
  return r.title_en
}

/** Minimal authenticated AI Gateway call so the dashboard shows real availability. */
export async function checkAi() {
  const started = Date.now()
  try {
    const { text } = await generateText({
      model: AI_MARKETING_MODEL,
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 16,
    })
    const ok = /ok/i.test(text)
    return {
      status: ok ? ("connected" as const) : ("error" as const),
      summary: ok ? `AI generation available (${AI_MARKETING_MODEL}).` : "Unexpected AI response.",
      details: { model: AI_MARKETING_MODEL, latencyMs: Date.now() - started, imageVideoGeneration: "not configured" },
    }
  } catch (e) {
    return {
      status: "error" as const,
      summary: e instanceof Error ? e.message : "AI generation failed",
      details: { model: AI_MARKETING_MODEL },
    }
  }
}
