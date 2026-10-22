"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Ban, CircleOff, Lock, Plug, Sparkles } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui"
import type { AiMarketingStrings } from "@/components/ai-marketing/strings"
import type { AiMarketingData } from "@/components/ai-marketing/manager"
import {
  createDraftRecommendation,
  decideRecommendation,
  executeApprovedRecommendation,
  generateAiRecommendations,
  runIntegrationCheck,
  setPublishingEnabled,
} from "@/lib/actions-ai-marketing"
import {
  CHECK_TYPES,
  REC_PLATFORMS,
  REC_STATUSES,
  type AiMarketingSection,
  type CheckStatus,
  type CheckType,
  type LiveResult,
  type MarketingRecommendation,
  type PlatformPerformance,
  type RecPlatform,
  type RecStatus,
} from "@/lib/ai-marketing/types"

type S = { s: AiMarketingStrings }
type D = { data: AiMarketingData }

const STATUS_STYLES: Record<RecStatus, string> = {
  pending: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  rejected: "border-border text-muted-foreground",
  executed: "border-primary/40 text-primary",
  failed: "border-destructive/40 text-destructive",
}

const CHECK_STYLES: Record<CheckStatus, string> = {
  connected: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  limited: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  not_configured: "border-border text-muted-foreground",
  error: "border-destructive/40 text-destructive",
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

function useNum() {
  const { lang } = useI18n()
  return React.useCallback(
    (n: number | null | undefined, digits = 0) =>
      n == null ? "—" : new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-US", { maximumFractionDigits: digits }).format(n),
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

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
}

/* ---------------- Connection checks ---------------- */
function TestButton({ s, type }: S & { type: CheckType }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await runIntegrationCheck(type)
            if (!res.ok) setError(res.error)
            router.refresh()
          })
        }}
      >
        {pending ? s.testing : s.testConnection}
      </Button>
      <ErrorText error={error} />
    </div>
  )
}

function CheckCard({ s, type, data }: S & D & { type: CheckType }) {
  const fmt = useFormatDate()
  const check = data.checks[type]
  const missing = (check?.details?.missing as string[] | undefined) ?? []
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.checkName[type]}</span>
              <Badge className={check ? CHECK_STYLES[check.status] : CHECK_STYLES.not_configured}>
                {check ? s.checkStatus[check.status] : s.notTested}
              </Badge>
            </div>
            {check && <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">{check.summary}</p>}
            {check && (
              <p className="mt-1 text-xs text-muted-foreground">
                {s.lastChecked}: {fmt(check.checked_at)}
                {check.checked_by_name && ` · ${check.checked_by_name}`}
              </p>
            )}
          </div>
        </div>
        <TestButton s={s} type={type} />
      </div>
      {missing.length > 0 && (
        <div className="rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="font-medium">{s.missingEnv}: </span>
          <span className="font-mono">{missing.join(", ")}</span>
        </div>
      )}
    </Card>
  )
}

/* ---------------- Live performance ---------------- */
function LiveState({ s, result, children }: S & { result: LiveResult<PlatformPerformance>; children: (d: PlatformPerformance) => React.ReactNode }) {
  if (result.state === "not_configured") return <EmptyState icon={CircleOff} title={`${s.notConnected} · ${s.noData}`} body={`${s.missingEnv}: ${result.missing.join(", ")}`} />
  if (result.state === "error")
    return (
      <Card role="alert" className="flex items-start gap-3 border-destructive/40 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-destructive">{s.apiError}</p>
          <p className="text-sm text-muted-foreground">{result.error}</p>
        </div>
      </Card>
    )
  return <>{children(result.data)}</>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function TotalsCard({ s, d }: S & { d: PlatformPerformance }) {
  const num = useNum()
  return (
    <Card>
      <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        {s.platform[d.platform]} · {d.accountId} · {d.rangeLabel}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <Metric label={`${s.spend} (${d.currency})`} value={num(d.totals.spend, 2)} />
        <Metric label={s.impressions} value={num(d.totals.impressions)} />
        <Metric label={s.clicks} value={num(d.totals.clicks)} />
        <Metric label={s.leads} value={num(d.totals.leads)} />
      </div>
    </Card>
  )
}

function CampaignTable({ s, d }: S & { d: PlatformPerformance }) {
  const num = useNum()
  if (d.campaigns.length === 0) return <EmptyState icon={CircleOff} title={s.noCampaigns} />
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="p-3 text-start font-medium">{s.campaign}</th>
            <th scope="col" className="p-3 text-start font-medium">{s.colStatus}</th>
            <th scope="col" className="p-3 text-end font-medium">{s.budget}</th>
            <th scope="col" className="p-3 text-end font-medium">{s.spend}</th>
            <th scope="col" className="p-3 text-end font-medium">{s.clicks}</th>
            <th scope="col" className="p-3 text-end font-medium">{s.leads}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {d.campaigns.map((c) => (
            <tr key={c.id}>
              <td className="p-3">
                <p className="font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.id}</p>
              </td>
              <td className="p-3 text-muted-foreground">{c.status}</td>
              <td className="p-3 text-end tabular-nums">{num(c.dailyBudget, 2)}</td>
              <td className="p-3 text-end tabular-nums">{num(c.spend, 2)}</td>
              <td className="p-3 text-end tabular-nums">{num(c.clicks)}</td>
              <td className="p-3 text-end tabular-nums">{num(c.leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function AttributionCard({ s, data }: S & D) {
  const num = useNum()
  const a = data.attribution
  const hasLeads = a && a.channels.some((c) => c.leads > 0)
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">{s.attribution}</h2>
        <p className="text-xs text-muted-foreground">{s.attrHint}</p>
      </div>
      {!a || !hasLeads ? (
        <EmptyState icon={CircleOff} title={s.noAttribution} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-medium" />
                {[s.leads, s.linkedLeads, s.appointments, s.jobs, s.customers, s.revenue, s.cpl, s.cpc, s.roas, s.convRate].map((h) => (
                  <th key={h} scope="col" className="p-3 text-end font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {a.channels.map((c) => (
                <tr key={c.channel}>
                  <th scope="row" className="p-3 text-start font-medium">{s.platform[c.channel]}</th>
                  <td className="p-3 text-end tabular-nums">{num(c.leads)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.linkedLeads)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.appointments)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.jobs)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.customers)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.revenue, 2)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.costPerLead, 2)}</td>
                  <td className="p-3 text-end tabular-nums">{num(c.costPerCustomer, 2)}</td>
                  <td className="p-3 text-end tabular-nums">{c.roas == null ? "—" : `${num(c.roas, 2)}x`}</td>
                  <td className="p-3 text-end tabular-nums">
                    {c.leadToCustomerRate == null ? "—" : `${num(c.leadToCustomerRate * 100, 1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {a.notes.length > 0 && (
            <ul className="border-t border-border p-3 text-xs text-muted-foreground">
              {a.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

/* ---------------- Recommendation card ---------------- */
function Detail({ label, value, dir }: { label: string; value?: string | null; dir?: "rtl" | "ltr" }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd dir={dir} className="whitespace-pre-wrap text-sm leading-relaxed">
        {value}
      </dd>
    </div>
  )
}

function RecCard({ s, rec, children }: S & { rec: MarketingRecommendation; children?: React.ReactNode }) {
  const fmt = useFormatDate()
  const { lang } = useI18n()
  const content = rec.proposed_action?.content
  const action = rec.proposed_action?.action
  const title = lang === "ar" && content?.title_ar ? content.title_ar : rec.title
  const summary = lang === "ar" && content?.summary_ar ? content.summary_ar : rec.summary

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-pretty">{title}</p>
          <p className="text-xs text-muted-foreground">
            {s.platform[rec.platform]} · {rec.source === "ai" ? s.ai : s.manual} · {fmt(rec.created_at)}
          </p>
        </div>
        <StatusBadge s={s} status={rec.status} />
      </div>
      {summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{summary}</p>}

      {(content || (action && action.kind !== "none")) && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{s.proposedAction}</summary>
          <dl className="flex flex-col gap-3 border-t border-border p-3">
            {action && (
              <Detail
                label={s.proposedAction}
                value={[
                  s.actionKind[action.kind] ?? action.kind,
                  action.name && `“${action.name}”`,
                  action.campaign_id && `ID ${action.campaign_id}`,
                  action.daily_budget_aed != null && `${action.daily_budget_aed} AED/day`,
                  action.status,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
            <Detail label={s.rationale} value={content?.rationale} />
            <Detail label={s.segment} value={content?.segment} />
            <Detail label={s.objective} value={content?.objective} />
            <Detail label={s.targeting} value={content?.targeting} />
            <Detail label={s.copyEn} value={content?.ad_copy_en} dir="ltr" />
            <Detail label={s.copyAr} value={content?.ad_copy_ar} dir="rtl" />
            <Detail label={s.brief} value={content?.creative_brief} />
          </dl>
        </details>
      )}

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
      {rec.failure_reason && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{rec.failure_reason}</p>}
      {children}
    </Card>
  )
}

/* ---------------- Overview ---------------- */
export function OverviewSection({ s, data, onNavigate }: S & D & { onNavigate: (next: AiMarketingSection) => void }) {
  const counts = Object.fromEntries(
    REC_STATUSES.map((st) => [st, data.recommendations.filter((r) => r.status === st).length]),
  ) as Record<RecStatus, number>
  const alerts = CHECK_TYPES.map((t) => data.checks[t]).filter((c) => c && c.status === "error")
  const live = [data.meta, data.google].filter((r): r is { state: "ok"; data: PlatformPerformance } => r.state === "ok")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.connections}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {CHECK_TYPES.map((t) => (
            <CheckCard key={t} s={s} type={t} data={data} />
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <Card role="alert" className="flex flex-col gap-2 border-destructive/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {s.alerts}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {alerts.map((c) => (
              <li key={c!.id}>
                <span className="font-medium text-foreground">{s.checkName[c!.check_type]}:</span> {c!.summary}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.livePerformance}</h2>
        {live.length === 0 ? (
          <EmptyState icon={CircleOff} title={`${s.notConnected} · ${s.noData}`} />
        ) : (
          live.map((r) => <TotalsCard key={r.data.platform} s={s} d={r.data} />)
        )}
      </div>

      <AttributionCard s={s} data={data} />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.recordsByStatus}</h2>
        {data.recommendations.length === 0 ? (
          <button type="button" onClick={() => onNavigate("recommendations")} className="rounded-xl text-start">
            <EmptyState icon={CircleOff} title={s.noRecs} body={s.aiHint} />
          </button>
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
export function PlatformSection({ s, platform, data }: S & D & { platform: "meta" | "google" }) {
  const related = data.recommendations.filter((r) => r.platform === platform)
  const result = platform === "meta" ? data.meta : data.google
  return (
    <div className="flex flex-col gap-4">
      <CheckCard s={s} type={platform} data={data} />
      <p className="text-sm leading-relaxed text-muted-foreground">{platform === "meta" ? s.metaBody : s.googleBody}</p>
      <LiveState s={s} result={result}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <TotalsCard s={s} d={d} />
            <h2 className="text-sm font-semibold text-muted-foreground">{s.campaigns}</h2>
            <CampaignTable s={s} d={d} />
          </div>
        )}
      </LiveState>
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
function GeneratePanel({ s }: S) {
  const router = useRouter()
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-medium">{s.generateAi}</p>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{s.aiHint}</p>
          {message && <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
          <ErrorText error={error} />
        </div>
      </div>
      <Button
        disabled={pending}
        onClick={() => {
          setError(null)
          setMessage(null)
          startTransition(async () => {
            const res = await generateAiRecommendations()
            if (!res.ok) setError(res.error)
            else setMessage(s.generatedCount(res.count))
            router.refresh()
          })
        }}
      >
        {pending ? s.generating : s.generateAi}
      </Button>
    </Card>
  )
}

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
            <Select id="ai-mkt-platform" value={platform} onChange={(e) => setPlatform(e.target.value as RecPlatform)}>
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
          <Textarea id="ai-mkt-summary" maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <ErrorText error={error} />
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
      <GeneratePanel s={s} />
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
function DecisionControls({ s, id, allowApprove = true }: S & { id: string; allowApprove?: boolean }) {
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
      <ErrorText error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => decide("rejected")}>
          {s.reject}
        </Button>
        {allowApprove && (
          <Button variant="success" size="sm" disabled={pending} onClick={() => decide("approved")}>
            {s.approve}
          </Button>
        )}
      </div>
    </div>
  )
}

function ExecuteControls({ s, rec, data }: S & D & { rec: MarketingRecommendation }) {
  const router = useRouter()
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const action = rec.proposed_action?.action
  if (rec.platform === "general" || !action || action.kind === "none") return null

  const platformOn = data.execSettings.find((x) => x.platform === rec.platform)?.publishing_enabled ?? false
  const blocked = !data.liveEnvEnabled ? s.execBlockedEnv : !platformOn ? s.execBlockedPlatform : null
  const id = `exec-${rec.id}`

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {blocked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {blocked}
        </p>
      ) : (
        <>
          <label htmlFor={id} className="text-sm font-medium">
            {s.confirmExecute}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="sm:max-w-48" />
            <Button
              variant="danger"
              size="sm"
              disabled={pending || confirm !== "EXECUTE"}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const res = await executeApprovedRecommendation({ id: rec.id, confirm })
                  if (!res.ok) setError(res.error)
                  router.refresh()
                })
              }}
            >
              {pending ? s.executing : s.execute}
            </Button>
          </div>
        </>
      )}
      <ErrorText error={error} />
    </div>
  )
}

export function ApprovalQueueSection({ s, data }: S & D) {
  const queue = data.recommendations.filter((r) => r.status === "pending")
  const approved = data.recommendations.filter((r) => r.status === "approved")
  return (
    <div className="flex flex-col gap-5">
      {queue.length === 0 ? (
        <EmptyState icon={CircleOff} title={s.noPending} />
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec}>
              <DecisionControls s={s} id={rec.id} />
            </RecCard>
          ))}
        </div>
      )}
      {approved.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{s.readyToExecute}</h2>
          {approved.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec}>
              <p className="text-xs text-muted-foreground">{s.approvedNote}</p>
              <ExecuteControls s={s} rec={rec} data={data} />
              <DecisionControls s={s} id={rec.id} allowApprove={false} />
            </RecCard>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Campaign History ---------------- */
const LOG_STYLES: Record<string, string> = {
  started: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  succeeded: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  failed: "border-destructive/40 text-destructive",
  blocked: "border-border text-muted-foreground",
}

const json = (v: unknown) => (v == null ? "—" : JSON.stringify(v, null, 2))

export function HistorySection({ s, data }: S & D) {
  const fmt = useFormatDate()
  const titles = new Map(data.recommendations.map((r) => [r.id, r.title]))
  const done = data.recommendations.filter((r) => r.status === "executed" || r.status === "failed")

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.actionLog}</h2>
        {data.actionLog.length === 0 ? (
          <EmptyState icon={Ban} title={s.noHistory} />
        ) : (
          <div className="flex flex-col gap-3">
            {data.actionLog.map((log) => (
              <Card key={log.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.actionKind[log.action_type] ?? log.action_type} · {s.platform[log.platform]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(log.recommendation_id && titles.get(log.recommendation_id)) || "—"} · {log.account_id ?? "—"} ·{" "}
                      {log.actor_name ?? "—"} · {fmt(log.created_at)}
                    </p>
                  </div>
                  <Badge className={LOG_STYLES[log.status]}>{s.logStatus[log.status] ?? log.status}</Badge>
                </div>
                <details className="rounded-lg border border-border text-xs">
                  <summary className="cursor-pointer px-3 py-2 font-medium">
                    {s.previous} / {s.next} / {s.result}
                  </summary>
                  <div className="grid gap-2 border-t border-border p-3 md:grid-cols-3">
                    {[
                      [s.previous, log.previous_values],
                      [s.next, log.new_values],
                      [s.result, log.api_result],
                    ].map(([label, value]) => (
                      <div key={label as string} className="min-w-0">
                        <p className="mb-1 font-medium text-muted-foreground">{label as string}</p>
                        <pre dir="ltr" className="overflow-x-auto rounded bg-muted p-2 font-mono">{json(value)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="flex flex-col gap-3">
          {done.map((rec) => (
            <RecCard key={rec.id} s={s} rec={rec} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{s.auditTrail}</h2>
        {data.events.length === 0 ? (
          <EmptyState icon={CircleOff} title={s.noEvents} />
        ) : (
          <Card>
            <ol className="divide-y divide-border">
              {data.events.map((ev) => (
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
function PublishingRow({ s, platform, data }: S & D & { platform: "meta" | "google" }) {
  const router = useRouter()
  const fmt = useFormatDate()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const setting = data.execSettings.find((x) => x.platform === platform)
  const on = setting?.publishing_enabled ?? false

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm">
            {s.settings.publishing} · {s.platform[platform]}
          </p>
          {setting && (
            <p className="text-xs text-muted-foreground">
              {s.settings.lastChanged}: {fmt(setting.changed_at)}
              {setting.changed_by_name && ` · ${setting.changed_by_name}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={on ? CHECK_STYLES.connected : CHECK_STYLES.not_configured}>
            {on ? s.settings.on : s.settings.off}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const res = await setPublishingEnabled({ platform, enabled: !on })
                if (!res.ok) setError(res.error)
                router.refresh()
              })
            }}
          >
            {on ? s.settings.disable : s.settings.enable}
          </Button>
        </div>
      </div>
      <ErrorText error={error} />
    </div>
  )
}

export function SettingsSection({ s, data }: S & D) {
  const locked: { label: string; value: string }[] = [
    { label: s.settings.approvalRequired, value: s.settings.always },
    { label: s.settings.autoExec, value: s.settings.disabled },
  ]
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <dl className="divide-y divide-border">
          {locked.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 p-4">
              <dt className="text-sm">{row.label}</dt>
              <dd className="flex items-center gap-2 text-sm font-medium">
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {row.value}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 p-4">
            <dt className="text-sm">{s.settings.serverSwitch}</dt>
            <dd className={cn("text-sm font-medium", data.liveEnvEnabled ? "text-foreground" : "text-muted-foreground")}>
              <span className="font-mono text-xs">AI_MARKETING_LIVE_EXECUTION</span> ·{" "}
              {data.liveEnvEnabled ? s.settings.on : s.settings.off}
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="divide-y divide-border">
        <PublishingRow s={s} platform="meta" data={data} />
        <PublishingRow s={s} platform="google" data={data} />
      </Card>
      <p className="text-xs leading-relaxed text-muted-foreground">{s.settings.publishHint}</p>
      <p className="text-xs text-muted-foreground">{s.settings.lockedNote}</p>
    </div>
  )
}
