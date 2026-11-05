import { cn } from "@/lib/utils"
import { statusLabel, statusTone } from "@/lib/technician-tasks"

const TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-500/15 text-sky-300",
  active: "bg-primary/15 text-primary",
  warn: "bg-amber-500/15 text-amber-300",
  done: "bg-emerald-500/15 text-emerald-300",
  danger: "bg-red-500/15 text-red-300",
}

export function TaskStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[statusTone(status)], className)}>
      {statusLabel(status)}
    </span>
  )
}

const PRIORITY: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-muted-foreground",
  high: "text-amber-300",
  urgent: "text-red-300",
}

export function PriorityText({ priority }: { priority: string }) {
  return <span className={cn("text-xs font-medium uppercase tracking-wide", PRIORITY[priority])}>{priority}</span>
}
