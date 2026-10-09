import Link from "next/link"
import { Archive } from "lucide-react"
import { BrandLogo } from "@/components/vehicle-visual"
import { cn } from "@/lib/utils"
import type { HistoryRow } from "@/lib/history-data"
import { PlateText, StatusPill, aed, shortDate } from "./history-shared"

export function HistoryInvoices({ rows }: { rows: HistoryRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Invoice history</caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
              <th scope="col" className="px-4 py-3 font-medium">Customer</th>
              <th scope="col" className="px-4 py-3 font-medium">Vehicle</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cancelled = r.status === "cancelled"
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{shortDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${r.id}`} className="font-mono font-medium text-primary hover:underline">
                      {r.invoiceNumber}
                    </Link>
                    {r.jobNumber ? (
                      <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        {r.jobId && !r.jobArchived ? (
                          <Link href={`/jobs/${r.jobId}`} className="hover:text-foreground hover:underline">
                            {r.jobNumber}
                          </Link>
                        ) : (
                          r.jobNumber
                        )}
                        {r.jobArchived ? (
                          <span className="inline-flex items-center gap-0.5 font-sans" title="Job card archived">
                            <Archive className="h-3 w-3" aria-hidden="true" /> archived
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.customerId ? (
                      <Link href={`/customers/${r.customerId}`} className="font-medium hover:underline">
                        {r.customerName}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.customerName}</span>
                    )}
                    {r.customerMobile ? (
                      <div className="text-[11px] tabular-nums text-muted-foreground">{r.customerMobile}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <BrandLogo make={r.make} size={22} className="shrink-0" />
                      <div className="min-w-0">
                        {r.vehicleId ? (
                          <Link href={`/vehicles/${r.vehicleId}`} className="block truncate hover:underline">
                            {r.vehicleLabel}
                          </Link>
                        ) : (
                          <span className="block truncate">{r.vehicleLabel}</span>
                        )}
                        <PlateText text={r.plateText} />
                      </div>
                    </div>
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums",
                      cancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {aed(r.total)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-right tabular-nums",
                      r.balance > 0 ? "font-medium text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {r.balance > 0 ? aed(r.balance) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/invoices/${r.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium text-primary">{r.invoiceNumber}</span>
                <StatusPill status={r.status} />
              </div>
              <div className="flex items-center gap-2">
                <BrandLogo make={r.make} size={22} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.vehicleLabel}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.customerName}</div>
                </div>
                <PlateText text={r.plateText} />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">
                  {shortDate(r.date)}
                  {r.jobNumber ? ` · ${r.jobNumber}` : ""}
                </span>
                <span className={cn("font-medium tabular-nums", r.status === "cancelled" && "line-through text-muted-foreground")}>
                  {aed(r.total)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
