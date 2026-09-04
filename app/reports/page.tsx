import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { ReportsClient } from "@/components/reports-client"

export const metadata = { title: "Reports · SHWURX Auto Service Center" }

function monthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const shellUser = await getShellUser()
  const supabase = await createClient()

  const def = monthRange()
  const from = sp.from || def.from
  const to = sp.to || def.to
  const toEnd = `${to}T23:59:59`

  const [{ data: invoices }, { data: pos }, { data: items }] = await Promise.all([
    supabase
      .from("invoices")
      .select("invoice_number, customer_name, status, issue_date, subtotal, vat_amount, total, amount_paid, parts_total, labour_total")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .neq("status", "cancelled"),
    supabase
      .from("purchase_orders")
      .select("po_number, order_date, status, subtotal, vat_amount, total, amount_paid, suppliers(name)")
      .gte("order_date", from)
      .lte("order_date", to)
      .neq("status", "cancelled"),
    supabase.from("inventory_items").select("quantity, cost_price").is("deleted_at", null),
  ])

  const inv = invoices ?? []
  const purchases = pos ?? []

  const salesSubtotal = inv.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
  const salesVat = inv.reduce((s, i) => s + (Number(i.vat_amount) || 0), 0)
  const salesTotal = inv.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const collected = inv.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0)
  const outstanding = inv.reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0)
  const partsSales = inv.reduce((s, i) => s + (Number(i.parts_total) || 0), 0)
  const labourSales = inv.reduce((s, i) => s + (Number(i.labour_total) || 0), 0)

  const purchaseSubtotal = purchases.reduce((s, p) => s + (Number(p.subtotal) || 0), 0)
  const purchaseVat = purchases.reduce((s, p) => s + (Number(p.vat_amount) || 0), 0)
  const purchaseTotal = purchases.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const payable = purchases.reduce((s, p) => s + ((Number(p.total) || 0) - (Number(p.amount_paid) || 0)), 0)

  const stockValue = (items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.cost_price) || 0), 0)

  // Net VAT position (output VAT collected on sales minus input VAT on purchases).
  const netVat = salesVat - purchaseVat
  // Gross profit approximation = sales subtotal − purchase subtotal in the period.
  const grossProfit = salesSubtotal - purchaseSubtotal

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
      <ReportsClient
        from={from}
        to={to}
        summary={{
          salesSubtotal,
          salesVat,
          salesTotal,
          collected,
          outstanding,
          partsSales,
          labourSales,
          purchaseSubtotal,
          purchaseVat,
          purchaseTotal,
          payable,
          stockValue,
          netVat,
          grossProfit,
          invoiceCount: inv.length,
          poCount: purchases.length,
        }}
        invoices={inv as any[]}
        purchases={purchases as any[]}
      />
      </div>
    </AppShell>
  )
}
