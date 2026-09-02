import { Card } from "@/components/ui"
import { Wrench, Package, ClipboardList } from "lucide-react"

type LabourItem = { name: string | null; detail: string | null }
type PartItem = { name: string | null; part_number: string | null; quantity: number }

export function TechnicianJobCard({
  complaint,
  approved,
  labour,
  parts,
}: {
  complaint: string | null
  approved: boolean
  labour: LabourItem[]
  parts: PartItem[]
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job card — repair work</h2>
        </div>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
          Technician view · no pricing
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
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Part</th>
                  <th className="px-3 py-2 font-medium">Part number</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{p.name || "Part"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.part_number || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No parts listed yet.</p>
        )}
      </div>
    </Card>
  )
}
