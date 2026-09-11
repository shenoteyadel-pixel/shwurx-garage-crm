import Link from "next/link"
import { Card, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Car, ArrowRight } from "lucide-react"
import type { LinkedVehicle } from "@/lib/linked-sales"

/**
 * Shows the customer sales invoice(s) for the same car(s) this purchase invoice
 * supplied parts for — matched by VIN through the linked job cards.
 */
export function LinkedSalesPanel({ vehicles }: { vehicles: LinkedVehicle[] }) {
  if (vehicles.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Car className="h-4 w-4" /> Sales invoices for the same car
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Matched by VIN via the linked job cards.</p>
      </div>
      <div className="divide-y divide-border/60">
        {vehicles.map((v) => (
          <div key={v.vin} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-foreground">{v.label}</p>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{v.vin}</span>
            </div>

            {v.invoices.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No customer sales invoice raised for this car yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {v.invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm transition-colors hover:border-border hover:bg-muted/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {inv.invoice_number || "Draft invoice"}
                        </span>
                        {inv.issue_date && (
                          <span className="shrink-0 text-xs text-muted-foreground">{formatDate(inv.issue_date)}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-foreground">{formatCurrency(inv.total)}</span>
                        <Badge className={inv.paid ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>
                          {inv.paid ? "Paid" : "Unpaid"}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
