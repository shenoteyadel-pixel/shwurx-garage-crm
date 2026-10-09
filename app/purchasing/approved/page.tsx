import Link from "next/link"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card } from "@/components/ui"
import { loadApprovedToOrder, type OrderLineStatus, type ApprovedJob } from "@/lib/approved-to-order"
import { CreateInvoiceFromQuoteButton } from "@/components/create-invoice-from-quote-button"
import { formatDate, cn } from "@/lib/utils"
import { ClipboardCheck } from "lucide-react"

export const metadata = { title: "Approved to Order · SHWURX Auto Service Center" }

const STATUS: Record<OrderLineStatus, { label: string; chip: string }> = {
  needs_quote: { label: "Needs supplier quote", chip: "border-red-500/30 bg-red-500/15 text-red-300" },
  to_order: { label: "Quoted, waiting invoice", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  invoice_draft: { label: "Invoice in draft", chip: "border-sky-500/30 bg-sky-500/15 text-sky-300" },
  received: { label: "Received", chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
}

export default async function ApprovedToOrderPage() {
  const user = await getShellUser()
  const jobs = await loadApprovedToOrder()
  const open = jobs.filter((j) => j.lines.some((l) => l.status !== "received"))
  const done = jobs.length - open.length

  const count = (s: OrderLineStatus) => open.reduce((t, j) => t + j.lines.filter((l) => l.status === s).length, 0)

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <PurchasingTabs perms={user.permissions} />

        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-balance">Approved to order</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Only the parts each customer approved. Declined parts are listed so they are never ordered.
          </p>
        </header>

        <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["needs_quote", "to_order", "invoice_draft"] as const).map((s) => (
            <div key={s} className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{STATUS[s].label}</dt>
              <dd className="font-mono text-xl font-semibold">{count(s)}</dd>
            </div>
          ))}
          <div className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">Cars fully received</dt>
            <dd className="font-mono text-xl font-semibold">{done}</dd>
          </div>
        </dl>

        {open.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <ClipboardCheck className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">Nothing waiting</p>
            <p className="text-sm text-muted-foreground">Every approved part is already received.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {open.map((j) => (
              <JobCard key={j.jobId} job={j} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function JobCard({ job }: { job: ApprovedJob }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/jobs/${job.jobId}`} className="font-mono text-sm font-semibold hover:underline">
              {job.jobNumber ?? "Job"}
            </Link>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                job.status === "approved"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-300",
              )}
            >
              {job.status === "approved" ? "Customer approved" : "Partly approved"}
            </span>
          </div>
          <p className="mt-1 text-sm">
            {job.vehicle}
            {job.plate ? <span className="text-muted-foreground"> · {job.plate}</span> : null}
            {job.customer ? <span className="text-muted-foreground"> · {job.customer}</span> : null}
          </p>
        </div>
        {job.decidedAt && <p className="text-xs text-muted-foreground">Approved {formatDate(job.decidedAt)}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Approved part</th>
              <th className="px-4 py-2 text-right font-semibold">Qty</th>
              <th className="px-4 py-2 font-semibold">Supplier</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {job.lines.map((l, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">
                  <p className="font-medium">{l.name}</p>
                  {l.partNumber && <p className="font-mono text-xs text-muted-foreground">{l.partNumber}</p>}
                </td>
                <td className="px-4 py-2 text-right font-mono">{l.quantity}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.supplier ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", STATUS[l.status].chip)}>
                    {STATUS[l.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {job.declined.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-xs">
          <p className="font-medium text-red-300">Declined by customer. Do not order:</p>
          <p className="mt-1 text-muted-foreground line-through">{job.declined.map((d) => d.name).join(", ")}</p>
        </div>
      )}

      {job.quotes.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3">
          {job.quotes.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <Link href={`/purchasing/invoices/${q.id}`} className="font-mono font-medium hover:underline">
                  {q.label}
                </Link>
                {q.supplier ? <span className="text-muted-foreground"> · {q.supplier}</span> : null}
              </p>
              {q.invoiceId ? (
                <Link href={`/purchasing/invoices/${q.invoiceId}`} className="text-sm font-medium text-primary hover:underline">
                  Open invoice {q.invoiceLabel}
                </Link>
              ) : (
                <CreateInvoiceFromQuoteButton quoteId={q.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
