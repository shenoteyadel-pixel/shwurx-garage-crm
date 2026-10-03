import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export type DuplicateAlarmRow = {
  id: string
  label: string
  invoiceNumber: string
  supplier: string
  total: string
  capturedBy: string
}

export function DuplicateInvoiceAlarm({ rows }: { rows: DuplicateAlarmRow[] }) {
  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-red-400">Duplicate invoices detected</h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {rows.length} saved invoices share the same invoice number from the same supplier. Review them and delete or
            void the extra copy so stock and supplier balances are not counted twice.
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-red-500/20 rounded-lg border border-red-500/20">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/purchasing/invoices/${r.id}`} className="font-mono font-medium text-primary hover:underline">
                {r.label}
              </Link>
              <span className="text-muted-foreground">
                {r.supplier} · Invoice #{r.invoiceNumber}
              </span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>Captured by {r.capturedBy}</span>
              <span className="tabular-nums text-foreground">{r.total}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
