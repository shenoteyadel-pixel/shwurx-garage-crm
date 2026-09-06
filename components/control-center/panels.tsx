import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import type { Analysis, Finding } from "@/lib/ai/analysis"
import { Card } from "@/components/ui"
import { ScoreRing, ScoreBar, SeverityChip, SEV_DOT, CATEGORY_LABEL, scoreLabel } from "./shared"
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  ListChecks,
  Layers,
} from "lucide-react"

function money(n: number) {
  return formatCurrency(n)
}

/* ------------------------------ Score hero ------------------------------ */
export function ScoreHero({ analysis }: { analysis: Analysis }) {
  const { score, headline } = analysis
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-5">
          <ScoreRing value={score.overall} />
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Business Health</div>
            <div className="text-2xl font-bold" style={{ color: undefined }}>
              {scoreLabel(score.overall)}
            </div>
            <p className="mt-1 max-w-md text-sm text-muted-foreground text-pretty">{headline}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-sm md:pl-6">
          {(Object.keys(score.categories) as (keyof typeof score.categories)[]).map((c) => (
            <ScoreBar key={c} label={CATEGORY_LABEL[c]} value={score.categories[c]} />
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------ Priorities ------------------------------ */
export function Priorities({ findings }: { findings: Finding[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top Priorities</h2>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing urgent — the business looks clean right now.</p>
      ) : (
        <ol className="space-y-2">
          {findings.map((f, i) => (
            <li key={f.id}>
              <FindingRow finding={f} rank={i + 1} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function FindingRow({ finding, rank }: { finding: Finding; rank?: number }) {
  const body = (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 transition hover:border-primary/40 hover:bg-accent/40">
      {rank ? (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
          {rank}
        </span>
      ) : (
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[finding.severity]}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{finding.title}</span>
          <SeverityChip severity={finding.severity} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{finding.detail}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {finding.amount != null && finding.amount !== 0 && (
          <span className="text-sm font-semibold tabular-nums">{money(Math.abs(finding.amount))}</span>
        )}
        {finding.href && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  )
  return finding.href ? (
    <Link href={finding.href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

/* --------------------------- Money overview ----------------------------- */
export function MoneyOverview({ analysis }: { analysis: Analysis }) {
  const m = analysis.money
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Money Overview</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ArrowDownRight className="h-4 w-4 text-emerald-400" />} label="Owed to you (AR)" value={money(m.receivableTotal)} sub={`${m.receivableCount} invoice(s)`} />
        <Stat icon={<ArrowUpRight className="h-4 w-4 text-red-400" />} label="You owe (AP)" value={money(m.payableTotal)} sub={`${m.payableCount} bill(s)`} />
        <Stat icon={<Banknote className="h-4 w-4 text-sky-400" />} label="Cash in (30d)" value={money(m.cashIn30)} sub={`${money(m.cashIn7)} last 7d`} />
        <Stat
          icon={m.netPosition >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
          label="Net position"
          value={money(m.netPosition)}
          sub="AR minus AP"
        />
      </div>

      {(m.receivableTop.length > 0 || m.payableTop.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {m.receivableTop.length > 0 && (
            <MiniList title="Largest amounts owed to you" lines={m.receivableTop} tone="emerald" />
          )}
          {m.payableTop.length > 0 && <MiniList title="Largest amounts you owe" lines={m.payableTop} tone="red" />}
        </div>
      )}
    </Card>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function MiniList({
  title,
  lines,
  tone,
}: {
  title: string
  lines: { id: string; label: string; amount: number; href: string | null }[]
  tone: "emerald" | "red"
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-1.5">
        {lines.map((l) => {
          const row = (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{l.label}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-300" : "text-red-300"}`}>
                {money(l.amount)}
              </span>
            </div>
          )
          return (
            <li key={l.id}>
              {l.href ? (
                <Link href={l.href} className="block rounded px-1 py-0.5 hover:bg-accent/50">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ---------------------------- Profitability ----------------------------- */
export function Profitability({ analysis }: { analysis: Analysis }) {
  const p = analysis.profitability
  if (p.invoicedJobs === 0) {
    return (
      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Profitability</h2>
        <p className="text-sm text-muted-foreground">No invoiced jobs yet, so there is nothing to measure margins on.</p>
      </Card>
    )
  }
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Profitability <span className="normal-case text-[11px] text-muted-foreground">(parts margin, excludes labour wages)</span>
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<span />} label="Invoiced revenue" value={money(p.totalRevenue)} sub={`${p.invoicedJobs} job(s)`} />
        <Stat icon={<span />} label="Parts cost" value={money(p.totalPartsCost)} />
        <Stat icon={<span />} label="Gross parts margin" value={money(p.estimatedGrossMargin)} />
        <Stat icon={<span />} label="Avg margin" value={p.avgMarginPct != null ? `${p.avgMarginPct.toFixed(1)}%` : "—"} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <JobList title="Most profitable jobs" jobs={p.best} positive />
        <JobList title="Least profitable jobs" jobs={p.worst} />
      </div>
    </Card>
  )
}

function JobList({
  title,
  jobs,
  positive,
}: {
  title: string
  jobs: { id: string; jobNumber: string; label: string; margin: number; marginPct: number | null; href: string }[]
  positive?: boolean
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-1.5">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={j.href} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/50">
              <span className="min-w-0 truncate">{j.label || j.jobNumber}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${j.margin < 0 ? "text-red-300" : positive ? "text-emerald-300" : "text-foreground"}`}>
                {money(j.margin)}
                {j.marginPct != null && <span className="ml-1 text-[11px] text-muted-foreground">{j.marginPct.toFixed(0)}%</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------- Pipeline ------------------------------- */
export function Pipeline({ analysis }: { analysis: Analysis }) {
  const p = analysis.pipeline
  const max = Math.max(1, ...p.jobStages.map((s) => s.count))
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workshop Pipeline</h2>
      </div>
      <div className="space-y-2">
        {p.jobStages.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{s.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
              <div className="flex h-full items-center justify-end rounded bg-primary/70 px-2 text-[10px] font-semibold text-primary-foreground" style={{ width: `${(s.count / max) * 100}%` }}>
                {s.count}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={<span />} label="Open quotations" value={String(p.openQuotationCount)} sub={money(p.openQuotationValue)} />
        <Stat icon={<span />} label="Pending appts" value={String(p.pendingAppointments)} />
        <Stat icon={<span />} label="New leads" value={String(p.newLeads)} />
      </div>
    </Card>
  )
}

/* --------------------- All findings, grouped by area -------------------- */
export function FindingsByCategory({ findings }: { findings: Finding[] }) {
  const cats = Array.from(new Set(findings.map((f) => f.category)))
  if (findings.length === 0) return null
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All Findings ({findings.length})</h2>
      <div className="space-y-5">
        {cats.map((c) => {
          const list = findings.filter((f) => f.category === c)
          return (
            <div key={c}>
              <div className="mb-2 text-xs font-semibold text-foreground">{CATEGORY_LABEL[c]} · {list.length}</div>
              <ul className="space-y-2">
                {list.map((f) => (
                  <li key={f.id}>
                    <FindingRow finding={f} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
