"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, Input } from "@/components/ui"
import { cn } from "@/lib/utils"
import {
  CATEGORY_LABEL,
  breakdown,
  type CategoryAmounts,
  type CategoryCard,
  type PartBuckets,
  type ReviewStats,
  type Scorecard,
} from "@/lib/advisor-performance"
import {
  AuditList,
  BreakdownTable,
  ClassificationPanel,
  ComparisonTable,
  ReviewsPanel,
  ScoreGrid,
  SettingsPanel,
  TargetEditor,
  aed,
  type CandidateItem,
  type ReviewItem,
  type TargetHistoryItem,
} from "@/components/advisor-performance-sections"

export interface PerformanceViewProps {
  mode: "admin" | "self"
  selfId: string
  month: string
  advisors: { id: string; name: string }[]
  scorecards: Scorecard[]
  teamCards: CategoryCard[]
  monthRows: { day: string; advisor_id: string | null; amounts: CategoryAmounts }[]
  yearRows: { day: string; advisor_id: string | null; amounts: CategoryAmounts }[]
  reviewStats: ReviewStats
  reviews: ReviewItem[]
  candidates: CandidateItem[]
  hasReviewLink: boolean
  addon: { qualified: number; commission: number; target: number }
  history?: TargetHistoryItem[]
  unclassified?: { id: string; invoice_number: string | null; description: string; line_total: number }[]
  audit?: { id: string; actor_name: string | null; action: string; detail: Record<string, unknown> | null; created_at: string }[]
  settings?: { googleReviewUrl: string | null; buckets: PartBuckets }
}

type Tab = "overview" | "targets" | "reviews" | "classification" | "settings" | "audit"

function downloadPayroll(month: string, scorecards: Scorecard[]) {
  const head = ["Advisor", "Category", "Qualified", "Target", "Achieved %", "Estimated commission", "Approved commission"]
  const lines = scorecards.flatMap((s) =>
    s.cards.map((c) => [
      s.name,
      CATEGORY_LABEL[c.category],
      c.achieved,
      c.target,
      c.percent,
      c.commission,
      c.approved ?? "",
    ]),
  )
  const csv = [head, ...lines]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `advisor-commission-${month}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AdvisorPerformanceView(props: PerformanceViewProps) {
  const router = useRouter()
  const admin = props.mode === "admin"
  const [tab, setTab] = useState<Tab>("overview")
  const [by, setBy] = useState<"day" | "week">("week")
  const [focus, setFocus] = useState<string>(admin ? "all" : props.selfId)

  const pick = <T extends { advisor_id: string | null }>(rows: T[]) =>
    focus === "all" ? rows : rows.filter((r) => r.advisor_id === focus)
  const periodRows = useMemo(() => breakdown(pick(props.monthRows), by), [props.monthRows, by, focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const yearRows = useMemo(() => breakdown(pick(props.yearRows), "month"), [props.yearRows, focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const self = props.scorecards.find((s) => s.advisorId === props.selfId)
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    ...(admin ? [{ id: "targets" as Tab, label: "Targets" }] : []),
    { id: "reviews", label: "Google Reviews" },
    ...(admin
      ? [
          { id: "classification" as Tab, label: `Part classification${props.unclassified?.length ? ` (${props.unclassified.length})` : ""}` },
          { id: "settings" as Tab, label: "Settings" },
          { id: "audit" as Tab, label: "Audit" },
        ]
      : []),
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-balance text-2xl font-semibold">{admin ? "Advisor Performance" : "My Performance"}</h1>
          <p className="text-pretty text-sm text-muted-foreground">
            Labour, new parts and used parts count from collected payments, excluding VAT, on the payment date. Refunds
            reduce the figures. Add-on sales are tracked separately.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Month
            <Input
              type="month"
              value={props.month}
              onChange={(e) => e.target.value && router.push(`?month=${e.target.value}`)}
              className="h-9"
            />
          </label>
          {admin && (
            <Button variant="outline" className="h-9" onClick={() => downloadPayroll(props.month, props.scorecards)}>
              Payroll CSV
            </Button>
          )}
        </div>
      </header>

      <nav aria-label="Performance sections" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "primary" : "outline"}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          {admin ? (
            <>
              <section aria-labelledby="team-h" className="flex flex-col gap-3">
                <h2 id="team-h" className="font-medium">
                  Team targets
                </h2>
                <ScoreGrid cards={props.teamCards} />
              </section>
              <ComparisonTable scorecards={props.scorecards} month={props.month} canApprove />
            </>
          ) : self ? (
            <section aria-labelledby="mine-h" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="mine-h" className="font-medium">
                  My targets
                </h2>
                <p className="text-sm text-muted-foreground">
                  Estimated {aed(self.estimated)} · Approved {aed(self.approved)}
                </p>
              </div>
              <ScoreGrid cards={self.cards} />
              {props.teamCards.some((c) => c.hasTarget) && (
                <>
                  <h2 className="font-medium">Team targets</h2>
                  <ScoreGrid cards={props.teamCards.filter((c) => c.hasTarget)} />
                </>
              )}
            </section>
          ) : null}

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">Add-on Product Sales</h2>
              <p className="text-sm text-muted-foreground">
                Managed in its own dashboard and never counted in the targets above. This month: {aed(props.addon.qualified)}{" "}
                qualified
                {props.addon.target > 0 ? ` of ${aed(props.addon.target)} target` : ""}, {aed(props.addon.commission)} estimated
                commission.
              </p>
            </div>
            <Link
              href={admin ? `/reports/addon-sales?month=${props.month}` : `/my-addon-sales?month=${props.month}`}
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              Open add-on dashboard
            </Link>
          </Card>

          <div className="flex flex-wrap items-end gap-3">
            {admin && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Advisor
                <select
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="all">All advisors</option>
                  {props.advisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div role="group" aria-label="Breakdown" className="flex gap-1">
              {(["day", "week"] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={by === v ? "primary" : "outline"}
                  aria-pressed={by === v}
                  onClick={() => setBy(v)}
                  className={cn("capitalize")}
                >
                  {v === "day" ? "Daily" : "Weekly"}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownTable title={`${by === "day" ? "Daily" : "Weekly"} · ${props.month}`} rows={periodRows} />
            <BreakdownTable title={`Monthly · ${props.month.slice(0, 4)}`} rows={yearRows} />
          </div>
        </>
      )}

      {tab === "targets" && admin && (
        <TargetEditor advisors={props.advisors} month={props.month} history={props.history ?? []} />
      )}

      {tab === "reviews" && (
        <ReviewsPanel
          stats={props.reviewStats}
          requests={props.reviews}
          candidates={props.candidates}
          advisors={props.advisors}
          selfId={props.selfId}
          canVerify={admin}
          hasReviewLink={props.hasReviewLink}
        />
      )}

      {tab === "classification" && admin && <ClassificationPanel lines={props.unclassified ?? []} />}
      {tab === "settings" && admin && props.settings && (
        <SettingsPanel googleReviewUrl={props.settings.googleReviewUrl} buckets={props.settings.buckets} />
      )}
      {tab === "audit" && admin && <AuditList entries={props.audit ?? []} />}
    </main>
  )
}
