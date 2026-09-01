import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PrintButton } from "@/components/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function QuotationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!job) notFound()

  const { data: quotation } = await supabase
    .from("quotations")
    .select(
      "id, vat_rate, description, parts_total, labor_total, discount_total, subtotal, vat_amount, total, created_at, quotation_items(kind, name, part_number, detail, description, quantity, unit_price, labour_hours, labour_rate, labor, discount, vat, line_total)",
    )
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!quotation) notFound()

  const items = (quotation.quotation_items ?? []) as any[]
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/jobs/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to job
        </a>
        <PrintButton />
      </div>

      {/* Document */}
      <div className="mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#e51f2b] pb-5">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">
              SHWURX<span className="text-[#e51f2b]"> GARAGE</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">Automotive Workshop &amp; Service Center</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold uppercase tracking-wide">Quotation</div>
            <p className="mt-1 font-mono text-sm text-neutral-600">{job.job_number}</p>
            <p className="text-xs text-neutral-500">{formatDate(quotation.created_at)}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Billed to
            </div>
            <div className="font-semibold">{job.customer_name}</div>
            <div className="text-neutral-600">{job.customer_mobile}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Vehicle</div>
            <div className="font-semibold">{vehicle}</div>
            <div className="text-neutral-600">
              {job.plate_number ? `Plate ${job.plate_number}` : ""}
              {job.mileage ? ` · ${job.mileage.toLocaleString()} km` : ""}
            </div>
            {job.vin && <div className="font-mono text-xs text-neutral-500">VIN {job.vin}</div>}
          </div>
        </div>

        {/* Description */}
        {quotation.description && (
          <div className="mb-5 rounded-md bg-neutral-50 p-4 text-sm">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Work description
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{quotation.description}</p>
          </div>
        )}

        {/* Items table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 px-2 text-right font-semibold">Qty</th>
              <th className="py-2 px-2 text-right font-semibold">Unit</th>
              <th className="py-2 px-2 text-right font-semibold">Labor</th>
              <th className="py-2 px-2 text-right font-semibold">Disc.</th>
              <th className="py-2 px-2 text-right font-semibold">VAT</th>
              <th className="py-2 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-neutral-200 align-top">
                <td className="py-3 pr-2">
                  <div className="font-medium">
                    {it.name || it.description || "Item"}
                    <span className="ml-2 text-[10px] uppercase text-neutral-400">
                      {KIND_LABEL[it.kind] || it.kind}
                    </span>
                  </div>
                  {it.detail && (
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-neutral-500">{it.detail}</p>
                  )}
                </td>
                <td className="py-3 px-2 text-right tabular-nums">{Number(it.quantity)}</td>
                <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(Number(it.unit_price))}</td>
                <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(Number(it.labor))}</td>
                <td className="py-3 px-2 text-right tabular-nums">
                  {Number(it.discount) > 0 ? `− ${formatCurrency(Number(it.discount))}` : "—"}
                </td>
                <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(Number(it.vat))}</td>
                <td className="py-3 pl-2 text-right font-medium tabular-nums">{formatCurrency(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <TotalRow label="Parts" value={formatCurrency(Number(quotation.parts_total))} />
            <TotalRow label="Labor" value={formatCurrency(Number(quotation.labor_total))} />
            {Number(quotation.discount_total) > 0 && (
              <TotalRow label="Discount" value={`− ${formatCurrency(Number(quotation.discount_total))}`} />
            )}
            <TotalRow label="Subtotal" value={formatCurrency(Number(quotation.subtotal))} />
            <TotalRow label={`VAT (${quotation.vat_rate}%)`} value={formatCurrency(Number(quotation.vat_amount))} />
            <div className="flex items-center justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(Number(quotation.total))}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
          This quotation is valid for 14 days from the date of issue. Prices are inclusive of VAT where applicable.
          <br />
          Thank you for choosing SHWURX Garage.
        </div>
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
