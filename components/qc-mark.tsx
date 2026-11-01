import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** Superscript "QC" seal shown after a name — like a trademark sign — once quality check has passed. */
export function QcMark({ passed, className }: { passed: boolean | null | undefined; className?: string }) {
  if (!passed) return null
  return (
    <sup
      title="Quality check passed"
      className={cn(
        "ml-1 inline-flex -translate-y-1 items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px align-super text-[10px] font-bold leading-none tracking-wider text-emerald-400",
        className,
      )}
    >
      <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
      QC
      <span className="sr-only"> passed</span>
    </sup>
  )
}
