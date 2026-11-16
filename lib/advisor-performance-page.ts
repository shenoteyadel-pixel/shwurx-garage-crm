import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { monthRange } from "@/lib/addon-month"
import { loadLedger, openAddonJobIds, syncAddonSales } from "@/lib/addon-sales-data"
import {
  buildScorecards,
  buildTeamCards,
  daysLeftInMonth,
  isClosedMonth,
  leaderboard,
  reviewStats,
} from "@/lib/advisor-performance"
import {
  loadAdvisors,
  loadApprovals,
  loadCollections,
  loadPerformanceAudit,
  loadPerformanceSettings,
  loadReviewCandidates,
  loadReviewRequests,
  loadTargets,
} from "@/lib/advisor-performance-data"
import type { PerformanceViewProps } from "@/components/advisor-performance-view"

const LIVE_ADDON = new Set(["approved", "completed"])

/**
 * Builds everything the performance view needs for one month. In self mode every query is
 * scoped to the signed-in advisor on the server, so no other advisor's figures are sent.
 */
export async function loadPerformanceView(opts: {
  mode: "admin" | "self"
  userId: string
  userName: string
  month?: string
}): Promise<PerformanceViewProps> {
  const admin = opts.mode === "admin"
  const scope = admin ? undefined : opts.userId
  const range = monthRange(opts.month)
  const year = range.month.slice(0, 4)
  const yearEnd = `${Number(year) + 1}-01-01`

  const settings = await loadPerformanceSettings()
  await syncAddonSales(await openAddonJobIds(scope))

  const svc = createServiceClient()
  const [advisorsAll, monthData, yearData, teamMonth, targets, history, approvals, reviews, ledger, teamLedger, audit] =
    await Promise.all([
      admin ? loadAdvisors() : Promise.resolve([{ id: opts.userId, name: opts.userName }]),
      loadCollections({ from: range.from, toExclusive: range.to, advisorId: scope, buckets: settings.buckets }),
      loadCollections({ from: `${year}-01-01`, toExclusive: yearEnd, advisorId: scope, buckets: settings.buckets }),
      admin
        ? Promise.resolve(null)
        : loadCollections({ from: range.from, toExclusive: range.to, buckets: settings.buckets }),
      loadTargets({ fromMonth: range.from, toMonth: range.from, userId: scope }),
      admin ? loadTargets({ fromMonth: range.from, toMonth: range.from, history: true }) : Promise.resolve([]),
      loadApprovals({ fromMonth: range.from, toMonth: range.from, userId: scope }),
      loadReviewRequests({ from: range.from, toExclusive: range.to, advisorId: scope }),
      loadLedger({ advisorId: scope, from: range.from, to: range.to }),
      admin ? Promise.resolve(null) : loadLedger({ from: range.from, to: range.to }),
      admin ? loadPerformanceAudit() : Promise.resolve([]),
    ])

  const todayKey = new Date().toISOString().slice(0, 10)
  const daysLeft = daysLeftInMonth(range.month, todayKey)
  const todayExtras = new Map<string, { addon?: number; reviews?: number }>()
  const bump = (id: string, key: "addon" | "reviews", n: number) => {
    const e = todayExtras.get(id) ?? {}
    e[key] = (e[key] ?? 0) + n
    todayExtras.set(id, e)
  }

  const verifiedByAdvisor = new Map<string, number>()
  for (const r of reviews) {
    if (!r.verified_at || !r.advisor_id) continue
    verifiedByAdvisor.set(r.advisor_id, (verifiedByAdvisor.get(r.advisor_id) ?? 0) + 1)
    if (r.verified_at.slice(0, 10) === todayKey) bump(r.advisor_id, "reviews", 1)
  }

  const addonByAdvisor = new Map<string, number>()
  let addonQualified = 0
  let addonCommission = 0
  for (const r of ledger) {
    if (!LIVE_ADDON.has(r.status)) continue
    addonQualified += r.line.netAmount
    if (r.commission.status !== "reversed") addonCommission += r.commission.potential
    if (!r.advisor_id) continue
    addonByAdvisor.set(r.advisor_id, (addonByAdvisor.get(r.advisor_id) ?? 0) + r.line.netAmount)
    if (r.approved_at?.slice(0, 10) === todayKey) bump(r.advisor_id, "addon", r.line.netAmount)
  }
  const teamAddon = (teamLedger ?? ledger)
    .filter((r) => LIVE_ADDON.has(r.status))
    .reduce((s, r) => s + r.line.netAmount, 0)

  const scorecards = buildScorecards({
    advisors: advisorsAll,
    rows: monthData.rows,
    verifiedByAdvisor,
    targets,
    approvals,
    addonByAdvisor,
    defaults: settings.defaults,
    todayKey,
    todayExtras,
    daysLeft,
  })

  let teamVerified = [...verifiedByAdvisor.values()].reduce((s, n) => s + n, 0)
  if (!admin) {
    const { count } = await svc
      .from("review_requests")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", range.from)
      .lt("sent_at", range.to)
      .not("verified_at", "is", null)
    teamVerified = count ?? 0
  }
  const teamCards = buildTeamCards(teamMonth?.rows ?? monthData.rows, teamVerified, targets, teamAddon)

  const candidates = await loadReviewCandidates(monthData.rows)

  const addonTargetTotal = scorecards.reduce(
    (s, sc) => s + (sc.cards.find((c) => c.category === "addon" && c.hasTarget)?.target ?? 0),
    0,
  )

  const strip = <T extends { day: string; advisor_id: string | null; amounts: unknown }>(rows: T[]) =>
    rows.map((r) => ({ day: r.day, advisor_id: r.advisor_id, amounts: r.amounts })) as PerformanceViewProps["monthRows"]

  return {
    mode: opts.mode,
    selfId: opts.userId,
    month: range.month,
    advisors: advisorsAll,
    scorecards,
    teamCards,
    leaderboard: leaderboard(scorecards),
    defaults: settings.defaults,
    closedThrough: settings.closedThrough,
    monthClosed: isClosedMonth(range.month, settings.closedThrough),
    monthRows: strip(monthData.rows),
    yearRows: strip(yearData.rows),
    reviewStats: reviewStats(candidates.length, reviews),
    reviews: reviews.map((r) => ({
      id: r.id,
      advisor_id: r.advisor_id,
      customer_name: r.customer_name,
      status: r.status,
      sent_at: r.sent_at,
      verified_at: r.verified_at,
      verification_evidence: r.verification_evidence,
    })),
    candidates: candidates.map((c) => ({
      job_id: c.job_id,
      job_number: c.job_number,
      advisor_id: c.advisor_id,
      customer_name: c.customer_name,
      requested: c.requested,
    })),
    hasReviewLink: Boolean(settings.googleReviewUrl),
    addon: {
      qualified: Math.round(addonQualified * 100) / 100,
      commission: Math.round(addonCommission * 100) / 100,
      target: addonTargetTotal,
    },
    ...(admin
      ? {
          history,
          unclassified: monthData.unclassified,
          audit,
          settings,
        }
      : {}),
  }
}
