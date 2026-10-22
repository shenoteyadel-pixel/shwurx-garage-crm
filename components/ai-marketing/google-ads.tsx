"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Lock, RefreshCw, Sparkles, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge, Button, Card } from "@/components/ui"
import { disconnectGoogleAds, generateGoogleAdsReport, syncGoogleAdsNow } from "@/lib/actions-google-ads"
import type { GoogleConfigStatus, GoogleDashboard, GoogleMetrics } from "@/lib/ai-marketing/google"
import type { GoogleLeadRow } from "@/lib/ai-marketing/google-leads"
import type { GoogleAlert, GoogleSyncRun } from "@/lib/ai-marketing/google-sync"
import type { LiveResult } from "@/lib/ai-marketing/types"

interface Props {
  config: GoogleConfigStatus
  redirectUri: string
  runs: GoogleSyncRun[]
  dashboard: LiveResult<GoogleDashboard>
  alerts: GoogleAlert[]
  funnel: GoogleLeadRow[]
  liveExecution: boolean
  flash: { ok: boolean; text: string } | null
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(iso))
    : "—"
const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n))
const aed = (n: number | null | undefined) => (n == null ? "—" : `AED ${num(n, 2)}`)
const pct = (n: number | null | undefined) => (n == null ? "—" : `${num(n * 100, 2)}%`)

const STATUS_STYLE: Record<string, string> = {
  ENABLED: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  PAUSED: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  REMOVED: "border-border text-muted-foreground",
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function useAction() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    start(async () => {
      setMsg(null)
      const r = await fn()
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error })
      router.refresh()
    })
  return { pending, msg, run }
}

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <p role="status" className={cn("text-sm leading-relaxed", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      {msg.text}
    </p>
  )
}

/* ---------------- Integration / diagnostics ---------------- */
function ConnectionPanel({ config, redirectUri, runs, dashboard }: Pick<Props, "config" | "redirectUri" | "runs" | "dashboard">) {
  const sync = useAction()
  const disconnect = useAction()
  const lastOk = runs.find((r) => r.status === "ok")
  const lastErr = runs.find((r) => r.status === "error")
  const latest = runs[0]
  // "Connected" only when the latest real API call returned account data.
  const connected = dashboard.state === "ok" && latest?.status !== "error"
  const state = connected
    ? { label: "Connected", icon: CheckCircle2, cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" }
    : dashboard.state === "not_configured"
      ? { label: "Not configured", icon: CircleDashed, cls: "border-border text-muted-foreground" }
      : { label: "Error", icon: XCircle, cls: "border-destructive/40 text-destructive" }
  const devToken = config.credentials.find((c) => c.key === "GOOGLE_ADS_DEVELOPER_TOKEN")?.configured
  const StateIcon = state.icon

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Google Ads API status</p>
            <p className="text-lg font-semibold">{dashboard.state === "ok" ? (dashboard.data.customer.name ?? config.customerId) : "SWURX Auto Service Center"}</p>
          </div>
          <Badge className={cn("gap-1", state.cls)}>
            <StateIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {state.label}
          </Badge>
        </div>
        <div>
          <Row label="OAuth connection">
            {config.refreshSource === "oauth"
              ? `Authorized by ${config.oauth?.authorizedByName ?? "owner"} · ${fmtDate(config.oauth?.authorizedAt)}`
              : config.refreshSource === "env"
                ? "Refresh token from environment"
                : "Not authorized"}
          </Row>
          <Row label="Developer token">{devToken ? "Configured" : "Missing"}</Row>
          <Row label="Manager account (MCC)">{config.loginCustomerId ?? "Not set"}</Row>
          <Row label="Customer account">{config.customerId ?? "Not set"}</Row>
          <Row label="API version">{config.apiVersion}</Row>
          <Row label="Last successful sync">{lastOk ? fmtDate(lastOk.finished_at ?? lastOk.started_at) : "Never"}</Row>
          <Row label="Last sync error">
            {lastErr ? (
              <span className="block max-w-xs text-pretty text-destructive">
                {fmtDate(lastErr.started_at)} — {lastErr.error ?? lastErr.summary}
              </span>
            ) : (
              "None"
            )}
          </Row>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={sync.pending} onClick={() => sync.run(syncGoogleAdsNow)}>
            <RefreshCw className={cn("h-4 w-4", sync.pending && "animate-spin")} aria-hidden="true" />
            {sync.pending ? "Testing & syncing…" : "Manual sync / API test"}
          </Button>
          {config.oauthClientReady ? (
            <a
              href="/api/google-ads/oauth/start"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent"
            >
              {config.refreshSource === "oauth" ? "Re-authorize with Google" : "Authorize with Google"}
            </a>
          ) : null}
          {config.refreshSource === "oauth" && (
            <Button
              variant="ghost"
              disabled={disconnect.pending}
              onClick={() => {
                if (confirm("Remove the stored Google authorization?")) disconnect.run(disconnectGoogleAds)
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
        <Message msg={sync.msg ?? disconnect.msg} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Credentials</p>
          <p className="text-sm leading-relaxed text-muted-foreground">Values are never shown. Only whether each one exists on the server.</p>
        </div>
        <ul className="flex flex-col">
          {config.credentials.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
              <code className="font-mono text-xs">{c.key}</code>
              {c.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Set
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CircleDashed className="h-4 w-4" aria-hidden="true" /> Missing
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-border p-3 text-xs leading-relaxed text-muted-foreground">
          OAuth redirect URI to register in Google Cloud:
          <code className="mt-1 block break-all font-mono text-foreground">{redirectUri}</code>
        </div>
        {dashboard.state === "error" && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{dashboard.error}</span>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------------- Dashboard ---------------- */
function Kpis({ t }: { t: GoogleMetrics }) {
  const items: [string, string][] = [
    ["Spend", aed(t.cost)],
    ["Impressions", num(t.impressions)],
    ["Clicks", num(t.clicks)],
    ["CTR", pct(t.ctr)],
    ["Avg. CPC", aed(t.avgCpc)],
    ["Conversions", num(t.conversions, 1)],
    ["Conv. rate", pct(t.convRate)],
    ["Cost / conv.", aed(t.costPerConv)],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <Card key={label} className="p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        </Card>
      ))}
    </div>
  )
}

type Bucket = { key: string; cost: number; clicks: number; conversions: number }
function bucketize(daily: GoogleDashboard["daily"], mode: "daily" | "weekly" | "monthly"): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const d of daily) {
    let key = d.date
    if (mode === "monthly") key = d.date.slice(0, 7)
    if (mode === "weekly") {
      const dt = new Date(`${d.date}T00:00:00Z`)
      dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7))
      key = dt.toISOString().slice(0, 10)
    }
    const b = map.get(key) ?? { key, cost: 0, clicks: 0, conversions: 0 }
    b.cost += d.cost
    b.clicks += d.clicks
    b.conversions += d.conversions
    map.set(key, b)
  }
  const out = [...map.values()]
  return mode === "daily" ? out.slice(-30) : out
}

function Trend({ daily }: { daily: GoogleDashboard["daily"] }) {
  const [mode, setMode] = React.useState<"daily" | "weekly" | "monthly">("daily")
  const buckets = bucketize(daily, mode)
  const max = Math.max(1, ...buckets.map((b) => b.cost))
  return (
    <Section
      title="Spend trend"
      aside={
        <div role="tablist" aria-label="Trend period" className="flex gap-1">
          {(["daily", "weekly", "monthly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium capitalize transition",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      <Card className="p-4">
        {buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spend recorded in the last 90 days.</p>
        ) : (
          <div className="flex h-40 items-end gap-1" role="img" aria-label={`${mode} spend in AED`}>
            {buckets.map((b) => (
              <div key={b.key} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t bg-primary/80 transition group-hover:bg-primary"
                  style={{ height: `${Math.max(2, (b.cost / max) * 100)}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow group-hover:block">
                  {b.key}: {aed(b.cost)} · {num(b.clicks)} clicks · {num(b.conversions, 1)} conv.
                </span>
              </div>
            ))}
          </div>
        )}
        {buckets.length > 0 && (
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{buckets[0].key}</span>
            <span>{buckets[buckets.length - 1].key}</span>
          </div>
        )}
      </Card>
    </Section>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <Card className="p-4 text-sm text-muted-foreground">{empty}</Card>
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-2 align-top", j > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Dashboard({ d, alerts }: { d: GoogleDashboard; alerts: GoogleAlert[] }) {
  const counts = d.campaigns.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {})
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Last 30 days · {d.range.from} to {d.range.to} · {d.customer.currency}
        </span>
        {(["ENABLED", "PAUSED", "REMOVED"] as const).map((st) => (
          <Badge key={st} className={STATUS_STYLE[st]}>
            {counts[st] ?? 0} {st === "ENABLED" ? "active" : st.toLowerCase()}
          </Badge>
        ))}
      </div>
      <Kpis t={d.totals} />
      {alerts.length > 0 && (
        <Section title="Monitoring alerts">
          <Card className="flex flex-col gap-2 p-4">
            {alerts.map((a, i) => (
              <p key={i} className="flex gap-2 text-sm leading-relaxed">
                <AlertTriangle
                  className={cn("mt-0.5 h-4 w-4 shrink-0", a.level === "warning" ? "text-amber-500" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                {a.message}
              </p>
            ))}
          </Card>
        </Section>
      )}
      <Trend daily={d.daily} />
      <Section title="Campaigns & budgets">
        <Table
          head={["Campaign", "Status", "Daily budget", "Spend", "Clicks", "CTR", "Avg. CPC", "Conv.", "Cost / conv."]}
          empty="No campaigns in this account."
          rows={d.campaigns.map((c) => [
            <span key="n" className="font-medium">
              {c.name}
              <span className="block text-xs text-muted-foreground">{c.channel}</span>
            </span>,
            <Badge key="s" className={STATUS_STYLE[c.status] ?? "border-border"}>
              {c.status}
            </Badge>,
            aed(c.dailyBudget),
            aed(c.cost),
            num(c.clicks),
            pct(c.ctr),
            aed(c.avgCpc),
            num(c.conversions, 1),
            aed(c.costPerConv),
          ])}
        />
      </Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Keywords">
          <Table
            head={["Keyword", "QS", "Spend", "Clicks", "Conv."]}
            empty="No keyword data for this period."
            rows={d.keywords.slice(0, 25).map((k) => [
              <span key="k">
                {k.text} <span className="text-xs text-muted-foreground">({k.matchType.toLowerCase()})</span>
                <span className="block text-xs text-muted-foreground">{k.campaign}</span>
              </span>,
              num(k.qualityScore),
              aed(k.cost),
              num(k.clicks),
              num(k.conversions, 1),
            ])}
          />
        </Section>
        <Section title="Search terms">
          <Table
            head={["Search term", "Spend", "Clicks", "Conv."]}
            empty="No search-term data for this period."
            rows={d.searchTerms.slice(0, 25).map((t) => [
              <span key="t">
                {t.term}
                <span className="block text-xs text-muted-foreground">{t.campaign}</span>
              </span>,
              aed(t.cost),
              num(t.clicks),
              num(t.conversions, 1),
            ])}
          />
        </Section>
      </div>
      {d.notes.length > 0 && <p className="text-xs text-muted-foreground">{d.notes.join(" · ")}</p>}
    </div>
  )
}

/* ---------------- AI reports ---------------- */
function ReportsPanel({ connected }: { connected: boolean }) {
  const a = useAction()
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-medium">AI performance report</p>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Covers wasted spend, negative keywords, cost per lead, budget allocation, new ad copy and a Meta comparison, using live data only. Reports go to the approval queue, and the scheduled job writes one every day at 08:00 Dubai, plus a weekly report on Mondays.
          </p>
          <Message msg={a.msg} />
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button disabled={!connected || a.pending} onClick={() => a.run(() => generateGoogleAdsReport("daily"))}>
          {a.pending ? "Generating…" : "Daily report"}
        </Button>
        <Button variant="ghost" disabled={!connected || a.pending} onClick={() => a.run(() => generateGoogleAdsReport("weekly"))}>
          Weekly report
        </Button>
      </div>
    </Card>
  )
}

/* ---------------- CRM leads ---------------- */
function LeadsPanel({ funnel }: { funnel: GoogleLeadRow[] }) {
  const unique = funnel.filter((l) => !l.duplicateOf)
  const converted = unique.filter((l) => l.converted)
  const revenue = unique.reduce((n, l) => n + (l.invoicePaid ?? 0), 0)
  return (
    <Section title="Google leads in CRM (90 days)">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Leads", num(unique.length)],
          ["With GCLID", num(unique.filter((l) => l.gclid).length)],
          ["Converted to paying", `${num(converted.length)} (${unique.length ? num((converted.length / unique.length) * 100, 1) : 0}%)`],
          ["Paid revenue", aed(revenue)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <Table
        head={["Lead", "Campaign / GCLID", "Vehicle · service", "Advisor", "Appointment", "Quote", "Job", "Invoice"]}
        empty="No Google Ads leads yet. Lead-form submissions and website enquiries with a GCLID or utm_source=google (cpc) will appear here."
        rows={funnel.slice(0, 50).map((l) => [
          <span key="l">
            <span className="font-medium">{l.name ?? "Unknown"}</span>
            {l.duplicateOf && <Badge className="ms-2 border-amber-500/40 text-amber-600 dark:text-amber-400">duplicate</Badge>}
            <span className="block text-xs text-muted-foreground">
              {l.phone ?? l.email ?? "—"} · {fmtDate(l.createdAt)}
            </span>
          </span>,
          <span key="c" className="block max-w-[180px] truncate text-xs">
            {l.campaign ?? "—"}
            <span className="block truncate text-muted-foreground">{l.gclid ? `${l.gclid.slice(0, 14)}…` : "no GCLID"}</span>
          </span>,
          <span key="v" className="text-xs">
            {l.vehicle ?? "—"}
            <span className="block text-muted-foreground">{l.service ?? "—"}</span>
          </span>,
          l.advisor ?? "—",
          l.appointmentStatus ?? "—",
          l.quotationStatus?.replace(/_/g, " ") ?? "—",
          l.jobStatus?.replace(/_/g, " ") ?? "—",
          l.invoiceTotal == null ? "—" : aed(l.invoiceTotal),
        ])}
      />
    </Section>
  )
}

export function GoogleAdsIntegration(props: Props) {
  const { dashboard, flash, liveExecution } = props
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link href="/ai-marketing?section=google" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AI Marketing Manager
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-balance">Google Ads Integration</h1>
            <p className="text-sm text-muted-foreground text-pretty">MCC 182-609-1325 → Customer 109-325-7662 · AED · Asia/Dubai</p>
          </div>
          <Badge className="gap-1 self-start border-primary/40 text-primary">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {liveExecution ? "Changes need owner approval" : "Read-only mode"}
          </Badge>
        </div>
      </header>

      {flash && (
        <Card role="status" className={cn("p-4 text-sm", flash.ok ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-destructive/40 text-destructive")}>
          {flash.text}
        </Card>
      )}

      <ConnectionPanel {...props} />
      <ReportsPanel connected={dashboard.state === "ok"} />

      {dashboard.state === "ok" ? (
        <Dashboard d={dashboard.data} alerts={props.alerts} />
      ) : (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <CircleDashed className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No live Google Ads data</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {dashboard.state === "not_configured"
              ? `The dashboard will show real campaign data once these are set: ${dashboard.missing.join(", ")}.`
              : "The last API request failed. See the diagnostics above."}
          </p>
        </Card>
      )}

      <LeadsPanel funnel={props.funnel} />
    </div>
  )
}
