import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { loadProfileNames } from "@/lib/invoice-duplicates"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card, Badge } from "@/components/ui"
import { InvoiceUpload } from "@/components/invoice-upload"
import { DeleteInvoiceButton } from "@/components/delete-invoice-button"
import { formatCurrency, formatDay } from "@/lib/utils"
import { FileText } from "lucide-react"

export const metadata = { title: "Supplier Quotes · SHWURX Auto Service Center" }

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "draft", tone: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  quoted: { label: "sent to job", tone: "border-sky-500/30 bg-sky-500/15 text-sky-300" },
  invoiced: { label: "invoiced", tone: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
}

export default async function SupplierQuotesPage() {
  const user = await getShellUser()
  const supabase = await createClient()
  const serviceDb = createServiceClient()

  const { data: quotes } = await supabase
    .from("supplier_invoices")
    .select("id, doc_number, doc_type, status, invoice_number, invoice_date, total, supplier_name_raw, created_at, created_by, suppliers(name)")
    .is("deleted_at", null)
    .or("doc_type.eq.quote,status.eq.quoted")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = quotes ?? []
  const { data: converted } = rows.length
    ? await serviceDb
        .from("supplier_invoices")
        .select("id, doc_number, invoice_number, source_quote_id")
        .in("source_quote_id", rows.map((r) => r.id))
        .is("deleted_at", null)
    : { data: [] }
  const invoiceOf = new Map((converted ?? []).map((c) => [c.source_quote_id as string, c]))
  const names = await loadProfileNames(serviceDb, rows.map((r) => r.created_by))

  const open = rows.filter((r) => r.status === "quoted" && !invoiceOf.has(r.id))
  const drafts = rows.filter((r) => r.status === "draft").length
  const openValue = open.reduce((t, r) => t + (Number(r.total) || 0), 0)

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supplier Quotes</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Supplier price quotes for job cards. No payment is recorded on a quote. Once the customer approves, convert it to
            the supplier invoice.
          </p>
        </div>

        <PurchasingTabs perms={user.permissions} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Waiting to be invoiced" value={String(open.length)} />
          <Stat label="Value of open quotes" value={formatCurrency(openValue)} />
          <Stat label="Drafts awaiting review" value={String(drafts)} />
        </div>

        <InvoiceUpload docType="quote" />

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Supplier quotes <span className="font-normal normal-case">({rows.length})</span>
            </h2>
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No supplier quotes yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold">Supplier ref</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Captured by</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const inv = invoiceOf.get(r.id)
                    const s = STATUS[inv ? "invoiced" : r.status] ?? STATUS.draft
                    return (
                      <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Link href={`/purchasing/invoices/${r.id}`} className="font-mono font-medium text-primary hover:underline">
                            {r.doc_number || "draft"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{(r as any).suppliers?.name ?? r.supplier_name_raw ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.invoice_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDay(r.invoice_date ?? r.created_at)}</td>
                        <td className="px-4 py-3">
                          <Badge className={s.tone}>{s.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {inv ? (
                            <Link href={`/purchasing/invoices/${inv.id}`} className="font-mono text-primary hover:underline">
                              {inv.doc_number || inv.invoice_number || "draft"}
                            </Link>
                          ) : r.status === "quoted" ? (
                            <Link href={`/purchasing/invoices/${r.id}`} className="text-xs font-medium text-primary hover:underline">
                              Convert to invoice
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{(r.created_by && names.get(r.created_by)) || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.total)}</td>
                        <td className="px-4 py-2 text-right">
                          {r.status === "draft" ? (
                            <DeleteInvoiceButton id={r.id} label={r.invoice_number || "draft"} kind="draft" compact />
                          ) : user.role === "owner" ? (
                            <DeleteInvoiceButton id={r.id} label={r.doc_number || r.invoice_number || "quote"} kind="confirmed" compact />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
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
