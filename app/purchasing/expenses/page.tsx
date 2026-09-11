import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { carExpenseCategoryLabel } from "@/lib/expenses"
import { Wallet, FileWarning, Paperclip } from "lucide-react"

export const metadata = { title: "Car Expenses · SHWURX Auto Service Center" }

export default async function CarExpensesPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: expenses } = await supabase
    .from("car_expenses")
    .select("*, jobs(id, job_number, vehicle_make, vehicle_model)")
    .order("expense_date", { ascending: false })
    .limit(300)

  const rows = expenses ?? []
  const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const noInvoiceTotal = rows.reduce((s, e) => s + (e.has_invoice ? 0 : Number(e.amount) || 0), 0)

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Car Expenses</h1>
            <p className="text-sm text-muted-foreground">
              {rows.length} expense{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} total ·{" "}
              {formatCurrency(noInvoiceTotal)} without invoice
            </p>
          </div>
        </div>

        <PurchasingTabs perms={user.permissions} />

        {rows.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No car expenses recorded yet.</p>
            <p className="text-xs text-muted-foreground">
              Open a job card to add expenses — including cash costs with no invoice.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Car / Job</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Paid to</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const job = (e as any).jobs
                    const car = job ? [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") : ""
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(e.expense_date)}</td>
                        <td className="px-4 py-3">
                          {job ? (
                            <Link href={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                              {job.job_number}
                              {car ? <span className="text-muted-foreground"> · {car}</span> : null}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            {carExpenseCategoryLabel(e.category)}
                            {e.receipt_url && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                          </span>
                          {e.description ? (
                            <div className="text-xs text-muted-foreground">{e.description}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.vendor ?? "—"}</td>
                        <td className="px-4 py-3">
                          {e.has_invoice ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                              {e.reference || "Yes"}
                            </Badge>
                          ) : (
                            <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">
                              <FileWarning className="h-3 w-3" /> No invoice
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(e.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
