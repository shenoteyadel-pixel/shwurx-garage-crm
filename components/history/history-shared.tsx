import { cn } from "@/lib/utils"
import type { HistoryStatus } from "@/lib/history-data"

export const STATUS_LABEL: Record<HistoryStatus, string> = {
  paid: "Paid",
  partial: "Part paid",
  unpaid: "Unpaid",
  cancelled: "Cancelled",
}

const STATUS_STYLE: Record<HistoryStatus, string> = {
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  partial: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  unpaid: "border-red-500/40 bg-red-500/10 text-red-400",
  cancelled: "border-border bg-muted text-muted-foreground",
}

export function StatusPill({ status }: { status: HistoryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function aed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function shortDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  })
}

export function PlateText({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex whitespace-nowrap rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] tracking-wide">
      {text}
    </span>
  )
}
