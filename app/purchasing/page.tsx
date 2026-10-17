import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card, Button, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, ShoppingCart, ScanLine } from "lucide-react"

export const metadata = { title: "Purchasing · SHWURX Auto Service Center" }

const STATUS: Record<string, string> = {
  draft: "border-neutral-500/30 bg-neutral-500/15 text-neutral-300",
  ordered: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  received: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-300",
}

const INV_STATUS: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  partial: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  unpaid: "border-red-500/30 bg-red-500/15 text-red-300",
  credit: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  quote: "border-sky-500/30 bg-sky-500/15 text-sky-300",
}

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>
}) {
  const { supplier } = await searchParams
  const user = await getShellUser()
  const supabase = await createClient()

  let query = supabase
    .from("purchase_orders")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false })
  if (supplier) query = query.eq("supplier_id", supplier)
  let invQuery = supabase
    .from("supplier_invoices")
    .select("id, doc_number, invoice_number, doc_type, status, payment_status, invoice_date, created_at, total, amount_paid, supplier_name_raw, suppliers(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (supplier) invQuery = invQuery.eq("supplier_id", supplier)
  const [{ data: pos }, { data: invoices }] = await Promise.all([query, invQuery])

  type Row = {
    key: string
    href: string
    number: string
    kind: "PO" | "Invoice" | "Quote"
    supplier: string
    date: string | null
    statusLabel: string
    statusClass: string
    total: number
    balance: number | null
    sortAt: string
  }

  const poRows: Row[] = (pos ?? []).map((p) => {
    const bal = p.status === "cancelled" ? 0 : (Number(p.total) || 0) - (Number(p.amount_paid) || 0)
    return {
      key: `po-${p.id}`,
      href: `/purchasing/${p.id}`,
      number: p.po_number,
      kind: "PO",
      supplier: (p as any).suppliers?.name ?? "—",
      date: p.order_date,
      statusLabel: p.status,
      statusClass: STATUS[p.status] ?? STATUS.draft,
      total: Number(p.total) || 0,
      balance: bal,
      sortAt: p.created_at,
    }
  })

  const invRows: Row[] = (invoices ?? []).map((i: any) => {
    const isQuote = i.doc_type === "quote"
    const confirmed = i.status === "confirmed"
    const total = Number(i.total) || 0
    const bal = !isQuote && confirmed ? Math.max(0, total - (Number(i.amount_paid) || 0)) : null
    const statusLabel = isQuote
      ? "quote only"
      : !confirmed
        ? i.status
        : i.payment_status === "credit"
          ? "on account"
          : i.payment_status
    const statusClass = isQuote
      ? INV_STATUS.quote
      : !confirmed
        ? STATUS.draft
        : (INV_STATUS[i.payment_status] ?? INV_STATUS.unpaid)
    return {
      key: `inv-${i.id}`,
      href: `/purchasing/invoices/${i.id}`,
      number: i.invoice_number || i.doc_number || "—",
      kind: isQuote ? "Quote" : "Invoice",
      supplier: i.suppliers?.name ?? i.supplier_name_raw ?? "—",
      date: i.invoice_date ?? i.created_at,
      statusLabel,
      statusClass,
      total,
      balance: bal,
      sortAt: i.created_at,
    }
  })

  const rows = [...poRows, ...invRows].sort((a, b) => (b.sortAt ?? "").localeCompare(a.sortAt ?? ""))
  const totalOutstanding = rows.reduce((s, r) => s + (r.balance ?? 0), 0)
  const invoiceCount = invRows.filter((r) => r.kind === "Invoice").length
  const quoteCount = invRows.length - invoiceCount

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            {poRows.length} purchase orders · {invoiceCount} supplier invoices · {quoteCount} quotes ·{" "}
            {formatCurrency(totalOutstanding)} payable
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/purchasing/invoices">
            <Button variant="danger">
              <ScanLine className="h-4 w-4" /> New Purchase Invoice
            </Button>
          </Link>
          <Link href="/purchasing/new">
            <Button variant="outline">
              <Plus className="h-4 w-4" /> New Purchase Order
            </Button>
          </Link>
        </div>
      </div>

      <PurchasingTabs perms={user.permissions} />

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
          <Link href="/purchasing/new">
            <Button variant="outline" className="mt-2">
              <Plus className="h-4 w-4" /> New Purchase Order
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Number</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Link href={r.href} className="font-mono font-medium text-primary hover:underline">
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.kind}</td>
                    <td className="px-4 py-3">{r.supplier}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.date ? formatDate(r.date) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={r.statusClass}>{r.statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(r.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.balance === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={r.balance > 0.01 ? "text-amber-400" : "text-emerald-400"}>
                          {formatCurrency(r.balance)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </div>
    </AppShell>
  )
}
