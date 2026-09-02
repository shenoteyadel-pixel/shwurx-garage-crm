import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { DocHeader, DocFooter } from "@/components/doc-header"
import { PrintButton } from "@/components/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function POPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [settings, { data: po }] = await Promise.all([
    getSettings(),
    supabase
      .from("purchase_orders")
      .select("*, suppliers(name, address, trn, mobile), purchase_order_items(*)")
      .eq("id", id)
      .maybeSingle(),
  ])
  if (!po) notFound()
  const items = (po.purchase_order_items ?? []) as any[]
  const supplier = (po as any).suppliers

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/purchasing/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to purchase order
        </a>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        <DocHeader settings={settings} title="Purchase Order" number={po.po_number} date={formatDate(po.order_date)} />

        <div className="grid grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Supplier</div>
            <div className="font-semibold">{supplier?.name ?? "—"}</div>
            {supplier?.address && <div className="text-neutral-600">{supplier.address}</div>}
            {supplier?.mobile && <div className="text-neutral-600">{supplier.mobile}</div>}
            {supplier?.trn && <div className="text-neutral-600">TRN {supplier.trn}</div>}
          </div>
          <div className="text-right">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Details</div>
            {po.expected_date && <div className="text-neutral-600">Expected: {formatDate(po.expected_date)}</div>}
            {po.supplier_invoice_no && <div className="text-neutral-600">Supplier inv: {po.supplier_invoice_no}</div>}
            <div className="text-neutral-600">Status: {po.status}</div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-semibold">Description</th>
              <th className="py-2 px-2 text-right font-semibold">Qty</th>
              <th className="py-2 px-2 text-right font-semibold">Unit cost</th>
              <th className="py-2 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-neutral-200">
                <td className="py-3 pr-2 font-medium">{it.description}</td>
                <td className="py-3 px-2 text-right tabular-nums">{Number(it.quantity)}</td>
                <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(it.unit_cost)}</td>
                <td className="py-3 pl-2 text-right font-medium tabular-nums">{formatCurrency(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <TotalRow label="Subtotal" value={formatCurrency(Number(po.subtotal))} />
            <TotalRow label="VAT" value={formatCurrency(Number(po.vat_amount))} />
            <div className="flex items-center justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(Number(po.total))}</span>
            </div>
          </div>
        </div>

        {po.notes && <p className="mt-6 whitespace-pre-wrap text-sm text-neutral-600">{po.notes}</p>}

        <DocFooter settings={settings} />
      </div>
    </main>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-neutral-600">
      <span>{label}</span>
      <span className="tabular-nums text-neutral-900">{value}</span>
    </div>
  )
}
