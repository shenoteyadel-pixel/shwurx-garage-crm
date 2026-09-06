import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, Badge } from "@/components/ui"
import { InvoiceUpload } from "@/components/invoice-upload"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ScanLine } from "lucide-react"

export const metadata = { title: "Invoice Capture · SHWURX Auto Service Center" }

const STATUS: Record<string, string> = {
  draft: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  confirmed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  void: "border-red-500/30 bg-red-500/15 text-red-300",
}

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default async function InvoiceCapturePage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from("supplier_invoices")
    .select("id, doc_number, status, payment_status, invoice_number, invoice_date, total, vat_amount, amount_paid, supplier_name_raw, created_at, suppliers(name)")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = invoices ?? []
  const from = monthStart()
  const inputVatThisMonth = rows
    .filter((r) => r.status === "confirmed" && (r.invoice_date ?? r.created_at?.slice(0, 10) ?? "") >= from)
    .reduce((t, r) => t + (Number(r.vat_amount) || 0), 0)
  const payable = rows
    .filter((r) => r.status === "confirmed")
    .reduce((t, r) => t + ((Number(r.total) || 0) - (Number(r.amount_paid) || 0)), 0)
  const drafts = rows.filter((r) => r.status === "draft").length

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoice Capture</h1>
          <p className="text-sm text-muted-foreground">
            Snap or upload a supplier invoice — the details, parts and VAT are read automatically, then you confirm.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Input VAT (this month)" value={formatCurrency(inputVatThisMonth)} />
          <Stat label="Payable to suppliers" value={formatCurrency(payable)} />
          <Stat label="Drafts awaiting review" value={String(drafts)} />
        </div>

        <InvoiceUpload />

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Captured invoices</h2>
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <ScanLine className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No invoices captured yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold">Invoice #</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">VAT</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Link href={`/purchasing/invoices/${r.id}`} className="font-mono font-medium text-primary hover:underline">
                          {r.doc_number || "draft"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{(r as any).suppliers?.name ?? r.supplier_name_raw ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.invoice_number ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.invoice_date ? formatDate(r.invoice_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge className={STATUS[r.status] ?? STATUS.draft}>{r.status}</Badge>
                          {r.status === "confirmed" && r.payment_status !== "paid" && (
                            <span className="text-xs text-amber-400">{r.payment_status}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.vat_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.total)}</td>
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
