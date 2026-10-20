"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Ban, CircleOff, Lock, Plug } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui"
import type { AiMarketingStrings } from "@/components/ai-marketing/strings"
import { createDraftRecommendation, decideRecommendation } from "@/lib/actions-ai-marketing"
import {
  REC_PLATFORMS,
  REC_STATUSES,
  type AiMarketingSection,
  type MarketingRecommendation,
  type MarketingRecommendationEvent,
  type RecPlatform,
  type RecStatus,
} from "@/lib/ai-marketing/types"

type S = { s: AiMarketingStrings }

const STATUS_STYLES: Record<RecStatus, string> = {
  pending: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  rejected: "border-border text-muted-foreground",
  executed: "border-primary/40 text-primary",
  failed: "border-destructive/40 text-destructive",
}

function useFormatDate() {
  const { lang } = useI18n()
  return React.useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Dubai",
      }).format(new Date(iso)),
    [lang],
  )
}

function StatusBadge({ s, status }: S & { status: RecStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{s.status[status]}</Badge>
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body?: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>}
    </Card>
  )
}

function RecCard({ s, rec, children }: S & { rec: MarketingRecommendation; children?: React.ReactNode }) {
  const fmt = useFormatDate()
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-pretty">{rec.title}</p>
          <p className="text-xs text-muted-foreground">
            {s.platform[rec.platform]} · {rec.source === "ai" ? s.ai : s.manual} · {fmt(rec.created_at)}
          </p>
        </div>
        <StatusBadge s={s} status={rec.status} />
      </div>
      {rec.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{rec.summary}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {rec.created_by_name && (
          <span>
            {s.createdBy}: {rec.created_by_name}
          </span>
        )}
        {rec.decided_by_name && rec.decided_at && (
          <span>
            {s.decidedBy}: {rec.decided_by_name} · {fmt(rec.decided_at)}
          </span>
        )}
      </div>
      {rec.decision_note && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{rec.decision_note}</p>}
      {rec.status === "approved" && <p className="text-xs text-muted-foreground">{s.approvedNote}</p>}
      {children}
    </Card>
  )
}

/* ---------------- Overview ---------------- */
export function OverviewSection({
  s,
  recommendations,
  onNavigate,
}: S & { recommendations: MarketingRecommendation[]; onNavigate: (next: AiMarketingSection) => void }) {
  const counts = Object.fromEntries(
    REC_STATUSES.map((st) => [st, recommendations.filter((r) => r.status === st).length]),
  ) as Record<RecStatus, number>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.connections}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["meta", "google"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onNavigate(p)}
              className="text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              <Card className="flex items-center justify-between gap-3 p-4 transition hover:bg-accent/40">
                <div className="flex items-center gap-3">
                  <Plug className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{s.platform[p]}</span>
                </div>
                <Badge className="border-border text-muted-foreground">{s.notConnected}</Badge>
              </Card>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.recordsByStatus}</h2>
        {recommendations.length === 0 ? (
          <EmptyState icon={CircleOff} title={s.noRecs} body={s.addDraftHint} />
        ) : (
          <Card className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x rtl:sm:divide-x-reverse">
            {REC_STATUSES.map((st) => (
              <div key={st} className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">{s.status[st]}</span>
                <span className="text-2xl font-semibold tabular-nums">{counts[st]}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- Meta / Google ---------------- */
export function PlatformSection({
  s,
  platform,
  recommendations,
}: S & { platform: "meta" | "google"; recommendations: MarketingRecommendation[] }) {
  const related = recommendations.filter((r) => r.platform === platform)
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{s.platform[platform]}</p>
              <Badge className="border-border text-muted-foreground">{s.notConnected}</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {platform === "meta" ? s.metaBody : s.googleBody}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          {s.connectLater}
        </Button>
      </Card>
      <EmptyState icon={CircleOff} title={s.noData} />
      {related.length > 0 && (
        <div className="flex flex-col gap-3">
          {related.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Recommendations ---------------- */
function DraftForm({ s }: S) {
  const router = useRouter()
  const [platform, setPlatform] = React.useState<RecPlatform>("general")
  const [title, setTitle] = React.useState("")
  const [summary, setSummary] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createDraftRecommendation({ platform, title, summary })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setTitle("")
      setSummary("")
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">{s.addDraft}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.addDraftHint}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={s.fieldPlatform} htmlFor="ai-mkt-platform">
            <Select
              id="ai-mkt-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as RecPlatform)}
            >
              {REC_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {s.platform[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.fieldTitle} htmlFor="ai-mkt-title" className="sm:col-span-2">
            <Input
              id="ai-mkt-title"
              required
              minLength={3}
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <Field label={s.fieldSummary} htmlFor="ai-mkt-summary">
          <Textarea
            id="ai-mkt-summary"
            maxLength={4000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || title.trim().length < 3}>
            {pending ? s.saving : s.save}
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function RecommendationsSection({ s, recommendations }: S & { recommendations: MarketingRecommendation[] }) {
  return (
    <div className="flex flex-col gap-4">
      <DraftForm s={s} />
      {recommendations.length === 0 ? (
        <EmptyState icon={CircleOff} title={s.noRecs} />
      ) : (
        <div className="flex flex-col gap-3">
          {recommendations.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Approval Queue ---------------- */
function DecisionControls({ s, id }: S & { id: string }) {
  const router = useRouter()
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const decide = (decision: "approved" | "rejected") => {
    setError(null)
    startTransition(async () => {
      const res = await decideRecommendation({ id, decision, note })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Textarea
        aria-label={s.notePlaceholder}
        placeholder={s.notePlaceholder}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-16"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => decide("rejected")}>
          {s.reject}
        </Button>
        <Button variant="success" size="sm" disabled={pending} onClick={() => decide("approved")}>
          {s.approve}
        </Button>
      </div>
    </div>
  )
}

export function ApprovalQueueSection({ s, recommendations }: S & { recommendations: MarketingRecommendation[] }) {
  const queue = recommendations.filter((r) => r.status === "pending")
  if (queue.length === 0) return <EmptyState icon={CircleOff} title={s.noPending} />
  return (
    <div className="flex flex-col gap-3">
      {queue.map((rec) => (
        <RecCard key={rec.id} s={s} rec={rec}>
          <DecisionControls s={s} id={rec.id} />
        </RecCard>
      ))}
    </div>
  )
}

/* ---------------- Campaign History ---------------- */
export function HistorySection({
  s,
  recommendations,
  events,
}: S & { recommendations: MarketingRecommendation[]; events: MarketingRecommendationEvent[] }) {
  const fmt = useFormatDate()
  const executed = recommendations.filter((r) => r.status === "executed" || r.status === "failed")
  const titles = new Map(recommendations.map((r) => [r.id, r.title]))

  return (
    <div className="flex flex-col gap-5">
      {executed.length === 0 ? (
        <EmptyState icon={Ban} title={s.noHistory} />
      ) : (
        <div className="flex flex-col gap-3">
          {executed.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.auditTrail}</h2>
        {events.length === 0 ? (
          <EmptyState icon={CircleOff} title={s.noEvents} />
        ) : (
          <Card>
            <ol className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{titles.get(ev.recommendation_id) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.ev[ev.event] ?? ev.event}
                      {ev.from_status && ` · ${s.status[ev.from_status as RecStatus] ?? ev.from_status} →`}
                      {ev.to_status && ` ${s.status[ev.to_status as RecStatus] ?? ev.to_status}`}
                      {ev.actor_name && ` · ${ev.actor_name}`}
                    </p>
                    {ev.note && <p className="mt-1 text-xs text-muted-foreground">{ev.note}</p>}
                  </div>
                  <time dateTime={ev.created_at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {fmt(ev.created_at)}
                  </time>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ---------------- Settings ---------------- */
export function SettingsSection({ s }: S) {
  const rows: { label: string; value: string; locked: boolean }[] = [
    { label: s.platform.meta, value: s.notConnected, locked: false },
    { label: s.platform.google, value: s.notConnected, locked: false },
    { label: s.settings.approvalRequired, value: s.settings.always, locked: true },
    { label: s.settings.autoExec, value: s.settings.disabled, locked: true },
    { label: s.settings.publish, value: s.settings.blocked, locked: true },
    { label: s.settings.budget, value: s.settings.blocked, locked: true },
  ]
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <dl className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 p-4">
              <dt className="text-sm">{row.label}</dt>
              <dd className={cn("flex items-center gap-2 text-sm", row.locked ? "font-medium" : "text-muted-foreground")}>
                {row.locked && <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <p className="text-xs text-muted-foreground">{s.settings.lockedNote}</p>
    </div>
  )
}
