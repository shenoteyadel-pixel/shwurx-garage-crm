import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { DocHeader, DocFooter } from "@/components/doc-header"
import { PrintButton } from "@/components/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [settings, { data: inv }] = await Promise.all([
    getSettings(),
    supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).maybeSingle(),
  ])
  if (!inv) notFound()
  const items = ((inv.invoice_items ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/invoices/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to invoice
        </a>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        <DocHeader
          settings={settings}
          title="Tax Invoice"
          number={inv.invoice_number}
          date={formatDate(inv.issue_date)}
        />

        <div className="grid grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Billed to</div>
            <div className="font-semibold">{inv.customer_name}</div>
            {inv.customer_mobile && <div className="text-neutral-600">{inv.customer_mobile}</div>}
            {inv.customer_trn && <div className="text-neutral-600">TRN {inv.customer_trn}</div>}
          </div>
          <div className="text-right">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Vehicle</div>
            {inv.vehicle_desc && <div className="font-semibold">{inv.vehicle_desc}</div>}
            {inv.plate && <div className="text-neutral-600">Plate {inv.plate}</div>}
            {inv.due_date && <div className="text-neutral-600">Due {formatDate(inv.due_date)}</div>}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-semibold">Description</th>
              <th className="py-2 px-2 text-left font-semibold">Type</th>
              <th className="py-2 px-2 text-right font-semibold">Qty</th>
              <th className="py-2 px-2 text-right font-semibold">Unit</th>
              <th className="py-2 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-neutral-200">
                <td className="py-3 pr-2 font-medium">{it.description}</td>
                <td className="py-3 px-2 capitalize text-neutral-500">{it.kind}</td>
                <td className="py-3 px-2 text-right tabular-nums">{Number(it.quantity)}</td>
                <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                <td className="py-3 pl-2 text-right font-medium tabular-nums">{formatCurrency(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <TotalRow label="Parts subtotal" value={formatCurrency(Number(inv.parts_total))} />
            <TotalRow label="Labour subtotal" value={formatCurrency(Number(inv.labour_total))} />
            {Number(inv.discount) > 0 && (
              <TotalRow label="Discount" value={`− ${formatCurrency(Number(inv.discount))}`} />
            )}
            <TotalRow label="Subtotal" value={formatCurrency(Number(inv.subtotal))} />
            <TotalRow label={`VAT (${inv.vat_rate}%)`} value={formatCurrency(Number(inv.vat_amount))} />
            <div className="flex items-center justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
              <span>Grand total</span>
              <span className="tabular-nums">{formatCurrency(Number(inv.total))}</span>
            </div>
            {Number(inv.amount_paid) > 0 && (
              <>
                <TotalRow label="Paid" value={formatCurrency(Number(inv.amount_paid))} />
                <div className="flex items-center justify-between font-semibold">
                  <span>Balance due</span>
                  <span className="tabular-nums">
                    {formatCurrency(Number(inv.total) - Number(inv.amount_paid))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {inv.notes && <p className="mt-6 whitespace-pre-wrap text-sm text-neutral-600">{inv.notes}</p>}

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
