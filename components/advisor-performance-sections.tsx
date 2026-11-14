"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, Input, Select } from "@/components/ui"
import { cn } from "@/lib/utils"
import {
  CATEGORY_LABEL,
  PART_SOURCES,
  TARGET_CATEGORIES,
  type BreakdownRow,
  type CategoryCard,
  type PartBuckets,
  type ReviewStats,
  type Scorecard,
  type TargetCategory,
} from "@/lib/advisor-performance"
import {
  approveAdvisorCommission,
  classifyInvoiceLine,
  recordReviewRequest,
  revokeAdvisorCommission,
  saveAdvisorTarget,
  savePerformanceSettings,
  setReviewDelivery,
  unverifyReview,
  verifyReview,
} from "@/lib/actions-advisor-performance"

export const aed = (n: number) =>
  `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const valueOf = (c: TargetCategory, n: number) => (c === "reviews" ? `${n} verified` : aed(n))

type Outcome = { ok: true } | { ok: false; error: string }

/** Runs a server action, shows its error, and refreshes the page on success. */
export function useRunner() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<Outcome>, after?: () => void) =>
    start(async () => {
      setError(null)
      const res = await fn()
      if (!res.ok) return setError(res.error)
      after?.()
      router.refresh()
    })
  return { pending, error, run }
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="px-4 pb-3 text-sm text-destructive">
      {error}
    </p>
  )
}

/* ---------------- Category cards ---------------- */

export function CategoryCardView({ card }: { card: CategoryCard }) {
  const pct = Math.min(100, card.percent)
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{CATEGORY_LABEL[card.category]}</h3>
        {card.hasTarget ? (
          <Badge className={cn(card.met ? "border-primary/40 text-primary" : "border-border text-muted-foreground")}>
            {card.met ? "Goal met" : "In progress"}
          </Badge>
        ) : (
          <Badge className="border-border text-muted-foreground">No target</Badge>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{valueOf(card.category, card.achieved)}</p>
      <div
        className="h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`${CATEGORY_LABEL[card.category]} achievement`}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Target</dt>
        <dd className="text-right tabular-nums">{card.hasTarget ? valueOf(card.category, card.target) : "-"}</dd>
        <dt className="text-muted-foreground">Achieved</dt>
        <dd className="text-right tabular-nums">{card.hasTarget ? `${card.percent}%` : "-"}</dd>
        <dt className="text-muted-foreground">Remaining</dt>
        <dd className="text-right tabular-nums">{card.hasTarget ? valueOf(card.category, card.remaining) : "-"}</dd>
        <dt className="text-muted-foreground">Estimated commission</dt>
        <dd className="text-right tabular-nums">{aed(card.commission)}</dd>
        <dt className="text-muted-foreground">Approved</dt>
        <dd className="text-right tabular-nums">{card.approved === null ? "Pending" : aed(card.approved)}</dd>
      </dl>
    </Card>
  )
}

export function ScoreGrid({ cards }: { cards: CategoryCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <CategoryCardView key={c.category} card={c} />
      ))}
    </div>
  )
}

/* ---------------- Advisor comparison & approvals ---------------- */

export function ComparisonTable({
  scorecards,
  month,
  canApprove,
}: {
  scorecards: Scorecard[]
  month: string
  canApprove: boolean
}) {
  const { pending, error, run } = useRunner()
  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="font-medium">Advisor comparison</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Collected, ex-VAT value for {month}. Approve a category once the month is closed; the amount is recalculated on
          approval.
        </p>
      </div>
      <ErrorText error={error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-y border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Advisor</th>
              {TARGET_CATEGORIES.map((c) => (
                <th key={c} className="px-4 py-2 text-right font-medium">
                  {CATEGORY_LABEL[c]}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Estimated</th>
              <th className="px-4 py-2 text-right font-medium">Approved</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((s) => (
              <tr key={s.advisorId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                {s.cards.map((c) => (
                  <td key={c.category} className="px-4 py-3 text-right align-top">
                    <div className="tabular-nums">{valueOf(c.category, c.achieved)}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.hasTarget ? `${c.percent}% of ${valueOf(c.category, c.target)}` : "No target"}
                    </div>
                    {canApprove && c.hasTarget && (
                      <div className="mt-1 flex justify-end gap-1">
                        {c.approved === null ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => run(() => approveAdvisorCommission({ userId: s.advisorId, month, category: c.category }))}
                          >
                            Approve {aed(c.commission)}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => run(() => revokeAdvisorCommission({ userId: s.advisorId, month, category: c.category }))}
                          >
                            Approved {aed(c.approved)} · Undo
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{aed(s.estimated)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{aed(s.approved)}</td>
              </tr>
            ))}
            {!scorecards.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No active service advisors.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Period breakdown ---------------- */

export function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <Card>
      <h2 className="p-4 font-medium">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-y border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 text-right font-medium">Labour</th>
              <th className="px-4 py-2 text-right font-medium">New parts</th>
              <th className="px-4 py-2 text-right font-medium">Used parts</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2">{r.key}</td>
                <td className="px-4 py-2 text-right tabular-nums">{aed(r.labour)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{aed(r.new_parts)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{aed(r.used_parts)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{aed(r.total)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No collected payments in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Target editor & history ---------------- */

export interface TargetHistoryItem {
  id: string
  scope: "individual" | "team"
  user_id: string | null
  category: string
  target: number
  commission_percent: number
  bonus_amount: number
  note: string | null
  created_at: string
  superseded_at: string | null
}

export function TargetEditor({
  advisors,
  month,
  history,
}: {
  advisors: { id: string; name: string }[]
  month: string
  history: TargetHistoryItem[]
}) {
  const { pending, error, run } = useRunner()
  const [scope, setScope] = useState<"individual" | "team">("individual")
  const [userId, setUserId] = useState(advisors[0]?.id ?? "")
  const [category, setCategory] = useState<TargetCategory>("labour")
  const [target, setTarget] = useState("")
  const [pct, setPct] = useState("")
  const [bonus, setBonus] = useState("")
  const [note, setNote] = useState("")
  const nameOf = new Map(advisors.map((a) => [a.id, a.name]))

  const pick = (h: TargetHistoryItem) => {
    setScope(h.scope)
    if (h.user_id) setUserId(h.user_id)
    setCategory(h.category as TargetCategory)
    setTarget(String(h.target))
    setPct(String(h.commission_percent))
    setBonus(String(h.bonus_amount))
    setNote(h.note ?? "")
  }

  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="font-medium">Targets for {month}</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Commission is the percentage on value above target, plus the bonus once the target is met. Changing a target
          keeps the old version in the history below.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault()
          run(
            () =>
              saveAdvisorTarget({
                scope,
                userId: scope === "team" ? null : userId,
                category,
                month,
                target: Number(target),
                commissionPercent: Number(pct || 0),
                bonusAmount: Number(bonus || 0),
                note,
              }),
            () => setNote(""),
          )
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Scope
          <Select value={scope} onChange={(e) => setScope(e.target.value as "individual" | "team")} className="h-9">
            <option value="individual">Individual</option>
            <option value="team">Team</option>
          </Select>
        </label>
        {scope === "individual" && (
          <label className="flex min-w-40 flex-col gap-1 text-xs text-muted-foreground">
            Advisor
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9" required>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <Select value={category} onChange={(e) => setCategory(e.target.value as TargetCategory)} className="h-9">
            {TARGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
          {category === "reviews" ? "Verified reviews" : "Target (AED, ex-VAT)"}
          <Input type="number" min={0} step="any" required value={target} onChange={(e) => setTarget(e.target.value)} className="h-9" />
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
          Commission %
          <Input type="number" min={0} max={100} step="any" value={pct} onChange={(e) => setPct(e.target.value)} className="h-9" />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-muted-foreground">
          Bonus (AED)
          <Input type="number" min={0} step="any" value={bonus} onChange={(e) => setBonus(e.target.value)} className="h-9" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Note
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="h-9" />
        </label>
        <Button type="submit" disabled={pending} className="h-9">
          {pending ? "Saving..." : "Save target"}
        </Button>
      </form>
      <ErrorText error={error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-y border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 text-right font-medium">Target</th>
              <th className="px-4 py-2 text-right font-medium">Commission</th>
              <th className="px-4 py-2 font-medium">Set</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className={cn("border-b border-border last:border-0", h.superseded_at && "text-muted-foreground")}>
                <td className="px-4 py-2">{h.scope === "team" ? "Team" : (nameOf.get(h.user_id ?? "") ?? "Former advisor")}</td>
                <td className="px-4 py-2">{CATEGORY_LABEL[h.category as TargetCategory] ?? h.category}</td>
                <td className="px-4 py-2 text-right tabular-nums">{valueOf(h.category as TargetCategory, h.target)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {h.commission_percent}% + {aed(h.bonus_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{new Date(h.created_at).toLocaleString("en-GB")}</td>
                <td className="px-4 py-2">
                  {h.superseded_at ? (
                    <span className="text-xs">Replaced</span>
                  ) : (
                    <button type="button" className="text-xs font-medium underline-offset-2 hover:underline" onClick={() => pick(h)}>
                      Active · Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No targets set for this month yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Google reviews ---------------- */

export interface ReviewItem {
  id: string
  advisor_id: string | null
  customer_name: string | null
  status: string
  sent_at: string
  verified_at: string | null
  verification_evidence: string | null
}

export interface CandidateItem {
  job_id: string
  job_number: string | null
  advisor_id: string | null
  customer_name: string | null
  requested: boolean
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function ReviewsPanel({
  stats,
  requests,
  candidates,
  advisors,
  selfId,
  canVerify,
  hasReviewLink,
}: {
  stats: ReviewStats
  requests: ReviewItem[]
  candidates: CandidateItem[]
  advisors: { id: string; name: string }[]
  selfId: string
  canVerify: boolean
  hasReviewLink: boolean
}) {
  const { pending, error, run } = useRunner()
  const [evidence, setEvidence] = useState<Record<string, string>>({})
  const nameOf = new Map(advisors.map((a) => [a.id, a.name]))
  const open = candidates.filter((c) => !c.requested && (canVerify || c.advisor_id === selfId))

  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="font-medium">Google review requests</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Send a request to every paid customer, whatever their experience. No reward is offered and the message asks for
          honest feedback. A review only counts once an admin verifies it with evidence.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-4">
        <Stat label="Request coverage" value={`${stats.coverage}%`} hint={`${stats.requested} of ${stats.eligibleJobs} paid jobs`} />
        <Stat label="Delivered" value={String(stats.delivered)} />
        <Stat label="Verified reviews" value={String(stats.verified)} />
        <Stat label="Request conversion" value={`${stats.conversion}%`} hint="Verified / requested" />
      </div>
      <ErrorText error={error} />

      {open.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <h3 className="text-sm font-medium">Paid jobs without a request</h3>
          {!hasReviewLink && (
            <p className="text-sm text-muted-foreground">An admin needs to add the Google review link in Settings first.</p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {open.map((c) => (
              <li key={c.job_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {c.job_number ?? "Job"} · {c.customer_name ?? "Customer"}
                  {canVerify && <span className="text-muted-foreground"> · {nameOf.get(c.advisor_id ?? "") ?? "Unassigned"}</span>}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !hasReviewLink}
                  onClick={() => {
                    const win = window.open("about:blank", "_blank", "noopener")
                    run(async () => {
                      const res = await recordReviewRequest(c.job_id)
                      if (res.ok && win) win.location.href = res.link
                      else win?.close()
                      return res
                    })
                  }}
                >
                  Send on WhatsApp
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              {canVerify && <th className="px-4 py-2 font-medium">Advisor</th>}
              <th className="px-4 py-2 font-medium">Delivery</th>
              <th className="px-4 py-2 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-xs">{new Date(r.sent_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-2">{r.customer_name ?? "Customer"}</td>
                {canVerify && <td className="px-4 py-2">{nameOf.get(r.advisor_id ?? "") ?? "Unassigned"}</td>}
                <td className="px-4 py-2">
                  <Select
                    aria-label="Delivery status"
                    value={r.status}
                    disabled={pending}
                    onChange={(e) => run(() => setReviewDelivery(r.id, e.target.value as "sent" | "delivered" | "failed"))}
                    className="h-8 text-xs"
                  >
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                  </Select>
                </td>
                <td className="px-4 py-2">
                  {r.verified_at ? (
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-primary">Verified</span>
                      <span className="text-muted-foreground">{r.verification_evidence}</span>
                      {canVerify && (
                        <button
                          type="button"
                          className="self-start underline-offset-2 hover:underline"
                          disabled={pending}
                          onClick={() => run(() => unverifyReview(r.id))}
                        >
                          Remove verification
                        </button>
                      )}
                    </div>
                  ) : canVerify ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        run(() => verifyReview(r.id, evidence[r.id] ?? ""))
                      }}
                    >
                      <label className="sr-only" htmlFor={`ev-${r.id}`}>
                        Verification evidence
                      </label>
                      <Input
                        id={`ev-${r.id}`}
                        placeholder="Reviewer name and date on Google"
                        value={evidence[r.id] ?? ""}
                        onChange={(e) => setEvidence((m) => ({ ...m, [r.id]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Button size="sm" type="submit" disabled={pending}>
                        Verify
                      </Button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not verified yet</span>
                  )}
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan={canVerify ? 5 : 4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No review requests in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Part classification ---------------- */

export function ClassificationPanel({
  lines,
}: {
  lines: { id: string; invoice_number: string | null; description: string; line_total: number }[]
}) {
  const { pending, error, run } = useRunner()
  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="font-medium">Unclassified part lines</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          These count under the bucket chosen for unclassified parts. Classifying a line only changes performance
          reporting, not the invoice.
        </p>
      </div>
      <ErrorText error={error} />
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{l.invoice_number ?? "Invoice"}</span> · {l.description}
              <span className="text-muted-foreground"> · {aed(l.line_total)}</span>
            </span>
            <Select
              aria-label={`Part source for ${l.description}`}
              defaultValue=""
              disabled={pending}
              onChange={(e) => e.target.value && run(() => classifyInvoiceLine(l.id, e.target.value))}
              className="h-8 w-40 text-xs"
            >
              <option value="">Classify...</option>
              {PART_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </li>
        ))}
        {!lines.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">All part lines are classified.</li>}
      </ul>
    </Card>
  )
}

/* ---------------- Settings ---------------- */

export function SettingsPanel({ googleReviewUrl, buckets }: { googleReviewUrl: string | null; buckets: PartBuckets }) {
  const { pending, error, run } = useRunner()
  const [url, setUrl] = useState(googleReviewUrl ?? "")
  const [map, setMap] = useState<PartBuckets>(buckets)
  const keys = [...PART_SOURCES, "unclassified"] as (keyof PartBuckets)[]
  return (
    <Card>
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => savePerformanceSettings({ googleReviewUrl: url, buckets: map }))
        }}
      >
        <h2 className="font-medium">Performance settings</h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Google review link
          <Input type="url" placeholder="https://g.page/r/..." value={url} onChange={(e) => setUrl(e.target.value)} className="h-9" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-xs text-muted-foreground">Which target each part type counts towards</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {keys.map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                {k[0].toUpperCase() + k.slice(1)}
                <Select
                  value={map[k]}
                  onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value as "new" | "used" }))}
                  className="h-8 w-28 text-xs"
                >
                  <option value="new">New parts</option>
                  <option value="used">Used parts</option>
                </Select>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="h-9">
            {pending ? "Saving..." : "Save settings"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </form>
    </Card>
  )
}

/* ---------------- Audit ---------------- */

export function AuditList({
  entries,
}: {
  entries: { id: string; actor_name: string | null; action: string; detail: Record<string, unknown> | null; created_at: string }[]
}) {
  return (
    <Card>
      <h2 className="p-4 font-medium">Audit history</h2>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 px-4 py-2 text-sm">
            <span>
              <span className="font-medium">{e.actor_name ?? "System"}</span> · {e.action.replace(/[._]/g, " ")}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(e.created_at).toLocaleString("en-GB")}
              {e.detail ? ` · ${JSON.stringify(e.detail).slice(0, 180)}` : ""}
            </span>
          </li>
        ))}
        {!entries.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No changes recorded yet.</li>}
      </ul>
    </Card>
  )
}
