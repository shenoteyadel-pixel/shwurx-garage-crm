import Link from "next/link"
import { Card } from "@/components/ui"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import type { ComparisonRow, QuoteComparison } from "@/lib/quote-invoice"
import { GitCompareArrows } from "lucide-react"

const STATUS: Record<ComparisonRow["status"], { label: string; chip: string }> = {
  same: { label: "Matches quote", chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  price_up: { label: "Price higher", chip: "border-red-500/30 bg-red-500/15 text-red-300" },
  price_down: { label: "Price lower", chip: "border-sky-500/30 bg-sky-500/15 text-sky-300" },
  qty: { label: "Qty changed", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  missing: { label: "Not on invoice", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  extra: { label: "Not on quote", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  declined: { label: "Customer declined", chip: "border-red-500/30 bg-red-500/15 text-red-300" },
}

const qty = (v: number | null) => (v === null ? "—" : String(Number(v.toFixed(2))))
const money = (v: number | null) => (v === null ? "—" : formatCurrency(v))

export function QuoteInvoiceComparison({ data }: { data: QuoteComparison }) {
  const issues = data.rows.filter((r) => r.status !== "same").length
  const diff = data.invoicedTotal - data.quotedTotal

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <GitCompareArrows className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">Quote vs invoice</h2>
            <p className="text-xs text-muted-foreground">
              Compared with{" "}
              <Link href={`/purchasing/invoices/${data.quote.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                {data.quote.label}
              </Link>
              {data.quote.date ? ` · ${formatDate(data.quote.date)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-right text-xs">
          <div>
            <p className="text-muted-foreground">Quoted (ex VAT)</p>
            <p className="font-mono text-sm font-semibold">{formatCurrency(data.quotedTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Invoiced (ex VAT)</p>
            <p className="font-mono text-sm font-semibold">{formatCurrency(data.invoicedTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Difference</p>
            <p
              className={cn(
                "font-mono text-sm font-semibold",
                Math.abs(diff) < 0.01 ? "text-emerald-300" : diff > 0 ? "text-red-300" : "text-sky-300",
              )}
            >
              {diff > 0 ? "+" : ""}
              {formatCurrency(diff)}
            </p>
          </div>
        </div>
      </div>

      <p className={cn("px-4 py-2 text-xs", issues ? "text-amber-300" : "text-emerald-300")}>
        {issues
          ? `${issues} line${issues === 1 ? "" : "s"} differ from the quote. Check them before you confirm.`
          : "Every line matches the supplier quote."}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Part</th>
              <th className="px-4 py-2 text-right font-semibold">Quoted qty</th>
              <th className="px-4 py-2 text-right font-semibold">Quoted cost</th>
              <th className="px-4 py-2 text-right font-semibold">Invoiced qty</th>
              <th className="px-4 py-2 text-right font-semibold">Invoiced cost</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">
                  <p className="font-medium">{r.name}</p>
                  {r.partNumber && <p className="font-mono text-xs text-muted-foreground">{r.partNumber}</p>}
                </td>
                <td className="px-4 py-2 text-right font-mono">{qty(r.quotedQty)}</td>
                <td className="px-4 py-2 text-right font-mono">{money(r.quotedCost)}</td>
                <td className={cn("px-4 py-2 text-right font-mono", r.status === "qty" && "text-amber-300")}>
                  {qty(r.invoicedQty)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right font-mono",
                    r.status === "price_up" && "text-red-300",
                    r.status === "price_down" && "text-sky-300",
                  )}
                >
                  {money(r.invoicedCost)}
                </td>
                <td className="px-4 py-2">
                  <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", STATUS[r.status].chip)}>
                    {STATUS[r.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {"The customer's approved selling prices stay the same on the job card. Only your cost changes."}
      </p>
    </Card>
  )
}
