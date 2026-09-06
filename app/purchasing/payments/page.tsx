import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Wallet } from "lucide-react"

export const metadata = { title: "Supplier Payments · SHWURX Auto Service Center" }

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default async function SupplierPaymentsPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  // Money leaving the business to suppliers, newest first, linked to the bill it settled.
  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount, method, reference, paid_at, note, created_at, supplier_invoice_id, supplier_invoices(doc_number, invoice_number, supplier_name_raw, suppliers(name))",
    )
    .eq("direction", "out")
    .order("paid_at", { ascending: false })
    .limit(300)

  const rows = (payments ?? []) as any[]
  const from = monthStart()
  const paidThisMonth = rows
    .filter((r) => (r.paid_at ?? r.created_at?.slice(0, 10) ?? "") >= from)
    .reduce((t, r) => t + (Number(r.amount) || 0), 0)
  const totalPaid = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0)

  const supplierOf = (r: any) =>
    r.supplier_invoices?.suppliers?.name ?? r.supplier_invoices?.supplier_name_raw ?? "—"

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supplier Payments</h1>
          <p className="text-sm text-muted-foreground">Every payment made to suppliers against captured invoices.</p>
        </div>

        <PurchasingTabs perms={user.permissions} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Paid this month" value={formatCurrency(paidThisMonth)} />
          <Stat label="Payments recorded" value={String(rows.length)} />
          <Stat label="Total paid (all time)" value={formatCurrency(totalPaid)} />
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No supplier payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(r.paid_at ?? r.created_at)}
                      </td>
                      <td className="px-4 py-3">{supplierOf(r)}</td>
                      <td className="px-4 py-3">
                        {r.supplier_invoice_id ? (
                          <Link
                            href={`/purchasing/invoices/${r.supplier_invoice_id}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {r.supplier_invoices?.doc_number || r.supplier_invoices?.invoice_number || "view"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{r.method ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.reference ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  )
}
