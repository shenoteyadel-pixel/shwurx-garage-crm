import { Card } from "@/components/ui"
import { Wrench, Package, ClipboardList } from "lucide-react"
import { tradeLabel, type Trade } from "@/lib/trades"

type LabourItem = { name: string | null; detail: string | null }
type PartItem = { name: string | null; part_number: string | null; quantity: number }

export function TechnicianJobCard({
  complaint,
  approved,
  labour,
  parts,
  trade,
}: {
  complaint: string | null
  approved: boolean
  labour: LabourItem[]
  parts: PartItem[]
  trade?: Trade
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job card — repair work</h2>
        </div>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {trade ? `${tradeLabel(trade)} view` : "Technician view"} · no pricing
        </span>
      </div>

      {complaint && (
        <div className="mb-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer complaint
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{complaint}</p>
        </div>
      )}

      {!approved && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
          Work is not customer-approved yet. Wait for approval before starting billable repairs.
        </p>
      )}

      {/* Approved repair work (labour) */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Wrench className="h-4 w-4" /> Approved repair work
        </div>
        {labour.length ? (
          <ul className="space-y-2">
            {labour.map((l, i) => (
              <li key={i} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="font-medium text-foreground">{l.name || "Repair task"}</div>
                {l.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{l.detail}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No repair tasks listed yet.</p>
        )}
      </div>

      {/* Required parts (no prices) */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Package className="h-4 w-4" /> Required parts
        </div>
        {parts.length ? (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
            {parts.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="text-foreground">{p.name || "Part"}</div>
                  {p.part_number && <div className="font-mono text-xs text-muted-foreground">{p.part_number}</div>}
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">{"× "}{p.quantity}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No parts listed yet.</p>
        )}
      </div>
    </Card>
  )
}
