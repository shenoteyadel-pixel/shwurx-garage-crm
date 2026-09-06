import type { Severity, Category } from "@/lib/ai/analysis"
import { cn } from "@/lib/utils"

export const SEV_STYLE: Record<Severity, string> = {
  critical: "border-red-500/30 bg-red-500/15 text-red-300",
  high: "border-orange-500/30 bg-orange-500/15 text-orange-300",
  medium: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  low: "border-slate-500/30 bg-slate-500/15 text-slate-300",
}

export const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-slate-400",
}

export const CATEGORY_LABEL: Record<Category, string> = {
  financial: "Financial",
  operations: "Operations",
  inventory: "Inventory",
  sales: "Sales & Pipeline",
  data: "Data Quality",
}

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", SEV_STYLE[severity])}>
      {severity}
    </span>
  )
}

export function scoreColor(v: number): string {
  if (v >= 80) return "#10b981"
  if (v >= 60) return "#f59e0b"
  if (v >= 40) return "#f97316"
  return "#ef4444"
}

export function scoreLabel(v: number): string {
  if (v >= 80) return "Healthy"
  if (v >= 60) return "Stable"
  if (v >= 40) return "Under pressure"
  return "Urgent"
}

/** CSS conic-gradient score ring — a load-bearing status gauge, no chart lib needed. */
export function ScoreRing({ value, size = 148 }: { value: number; size?: number }) {
  const color = scoreColor(value)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${value * 3.6}deg, rgba(130,130,140,0.15) 0deg)` }}
        aria-hidden
      />
      <div className="absolute inset-[12px] flex flex-col items-center justify-center rounded-full bg-card">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}

/** Horizontal progress bar used for category sub-scores. */
export function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}
