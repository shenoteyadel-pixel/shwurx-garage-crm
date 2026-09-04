import { Car, FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react"
import { portalStageProgress, type PortalData } from "@/lib/portal-data"
import { formatCurrency } from "@/lib/utils"

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/** Read-only customer-facing view of jobs + invoices. Shared by the token portal and the logged-in portal. */
export function PortalView({
  data,
  headerRight,
  banner,
}: {
  data: PortalData
  headerRight?: React.ReactNode
  banner?: React.ReactNode
}) {
  const { customer, jobs, invoices } = data
  const outstanding = invoices.reduce(
    (s, i) => s + Math.max(0, (Number(i.total) || 0) - (Number(i.amount_paid) || 0)),
    0,
  )

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Car className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight tracking-tight">SHWURX Auto Service Center</h1>
            <p className="truncate text-xs text-muted-foreground">Service status for {customer.full_name}</p>
          </div>
          {headerRight}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {banner}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Active Jobs</p>
            <p className="mt-1 text-2xl font-bold">{jobs.filter((j) => j.stage !== "delivered").length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Jobs</p>
            <p className="mt-1 text-2xl font-bold">{jobs.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-card p-4 sm:col-span-1">
            <p className="text-xs text-muted-foreground">Outstanding Balance</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">{formatCurrency(outstanding)}</p>
          </div>
        </div>

        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" /> Service Progress
        </h2>
        {jobs.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No service jobs on record yet.
          </p>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => {
              const progress = portalStageProgress(j.stage)
              const done = j.stage === "delivered"
              return (
                <div key={j.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{j.vehicle_label}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.plate ? `${j.plate} · ` : ""}Job {j.job_number ?? j.id.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        done
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                          : "border-sky-500/30 bg-sky-500/15 text-sky-300"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      {j.stage_label}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-primary"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Started {fmtDate(j.created_at)}</span>
                    <span>{progress}% complete</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" /> Invoices
        </h2>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No invoices issued yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const bal = Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0))
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{inv.invoice_number ?? inv.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.created_at)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(inv.total)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${bal > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {bal > 0 ? formatCurrency(bal) : "Paid"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          This is a secure, read-only view. Please contact us for any changes.
        </p>
      </div>
    </main>
  )
}
