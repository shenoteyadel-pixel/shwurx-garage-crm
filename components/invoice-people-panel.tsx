import Link from "next/link"
import { AlertTriangle, CheckCircle2, UserRound } from "lucide-react"
import { Card } from "@/components/ui"
import type { DuplicateMatch } from "@/lib/invoice-duplicates"

const fmt = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(v))
    : null

export function InvoicePeoplePanel({
  capturedBy,
  capturedAt,
  confirmedBy,
  confirmedAt,
  duplicateOf,
}: {
  capturedBy: string | null
  capturedAt: string | null
  confirmedBy: string | null
  confirmedAt: string | null
  duplicateOf: DuplicateMatch[]
}) {
  return (
    <div className="flex flex-col gap-3">
      {duplicateOf.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold text-red-400">Duplicate invoice</p>
            <p className="leading-relaxed text-muted-foreground">
              {"This invoice number from this supplier is also saved as "}
              {duplicateOf.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link href={`/purchasing/invoices/${d.id}`} className="font-mono font-medium text-primary hover:underline">
                    {d.label}
                  </Link>
                </span>
              ))}
              . Keep one and delete or void the other.
            </p>
          </div>
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-8">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Captured by</span>
            <span className="text-sm font-medium">{capturedBy ?? "Unknown"}</span>
            {fmt(capturedAt) && <span className="text-xs text-muted-foreground">{fmt(capturedAt)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed by</span>
            <span className="text-sm font-medium">{confirmedBy ?? "Not confirmed yet"}</span>
            {fmt(confirmedAt) && <span className="text-xs text-muted-foreground">{fmt(confirmedAt)}</span>}
          </div>
        </div>
      </Card>
    </div>
  )
}
