import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "text-primary",
  bg = "bg-primary/10",
}: {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  accent?: string
  bg?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-4 w-4", accent)} />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
