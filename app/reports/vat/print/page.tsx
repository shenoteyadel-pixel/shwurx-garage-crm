import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { DocHeader, DocFooter, DocWatermark, DocBrandStrip } from "@/components/doc-header"
import { PrintButton } from "@/components/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"
import { loadVatReport, currentQuarter, type VatBox } from "@/lib/vat-report"

export const metadata = { title: "VAT Return (VAT 201)" }

const n2 = (v: number) => v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function VatPrintPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const q = currentQuarter()
  const from = sp.from || q.from
  const to = sp.to || q.to
  const supabase = await createClient()
  const [settings, report] = await Promise.all([getSettings(), loadVatReport(supabase, from, to)])

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/reports/vat?from=${from}&to=${to}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to VAT report
        </a>
        <PrintButton />
      </div>

      <div className="relative isolate mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        <DocWatermark settings={settings} />
        <DocHeader
          settings={settings}
          title="VAT Return (VAT 201)"
          number={`${formatDate(from)} – ${formatDate(to)}`}
          date={formatDate(new Date().toISOString())}
        />

        <div className="grid grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Taxable person</div>
            <div className="font-semibold">{settings.legal_name || settings.company_name}</div>
            {settings.address && <div className="text-neutral-600">{settings.address}</div>}
            <div className="text-neutral-600">TRN {settings.trn || "—"}</div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Tax period</div>
            <div className="font-semibold">
              {formatDate(from)} – {formatDate(to)}
            </div>
            <div className="text-neutral-600">Currency: AED</div>
            <div className="text-neutral-600">Authority: Federal Tax Authority, UAE</div>
          </div>
        </div>

        <BoxTable title="VAT on sales and all other outputs" vatHeader="VAT amount" boxes={report.outputBoxes} total={{ box: "8", ...report.box8 }} />
        <BoxTable title="VAT on expenses and all other inputs" vatHeader="Recoverable VAT" boxes={report.inputBoxes} total={{ box: "11", ...report.box11 }} />

        <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Net VAT due</h3>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <NetRow box="12" label="Total value of due tax for the period" value={report.box12} />
            <NetRow box="13" label="Total value of recoverable tax for the period" value={report.box13} />
            <tr className="border-t-2 border-neutral-800 text-base font-bold">
              <td className="w-12 py-2 font-mono text-xs">14</td>
              <td className="py-2">Payable tax for the period</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(report.box14)}</td>
            </tr>
          </tbody>
        </table>

        {report.blockedCount > 0 && (
          <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {formatCurrency(report.blockedInputVat)} input VAT on {report.blockedCount} purchase invoice(s) was excluded
            from Box 9: supplier TRN missing or invalid (no valid tax invoice).
          </p>
        )}

        <div className="break-before-page pt-6">
          <Register
            title="Sales tax invoice register"
            head={["Invoice", "Date", "Customer", "Customer TRN", "Net", "VAT", "Total"]}
            rows={report.sales.map((s) => [s.number, formatDate(s.date), s.customer, s.customerTrn || "—", n2(s.net), n2(s.vat), n2(s.total)])}
          />
          <Register
            title="Purchase tax invoice register"
            head={["Invoice", "Date", "Supplier", "Supplier TRN", "Net", "VAT", "Recoverable"]}
            rows={report.purchases.map((p) => [
              p.number,
              formatDate(p.date),
              p.supplier,
              p.supplierTrn || "—",
              n2(p.net),
              n2(p.vat),
              p.recoverable ? "Yes" : "No",
            ])}
          />
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-neutral-500">
          Prepared in accordance with Federal Decree-Law No. 8 of 2017 on Value Added Tax and its Executive Regulation.
          Standard rate 5%; place of supply Dubai. This summary supports the VAT 201 return filed on EmaraTax. Tax records
          must be retained for a minimum of 5 years.
        </p>

        <DocBrandStrip />
        <DocFooter settings={settings} />
      </div>
    </main>
  )
}

function BoxTable({
  title,
  vatHeader,
  boxes,
  total,
}: {
  title: string
  vatHeader: string
  boxes: VatBox[]
  total: { box: string; amount: number; vat: number }
}) {
  return (
    <>
      <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="w-12 py-2 font-semibold">Box</th>
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 text-right font-semibold">Amount</th>
            <th className="py-2 text-right font-semibold">{vatHeader}</th>
            <th className="py-2 text-right font-semibold">Adjustment</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((b) => (
            <tr key={b.box} className="border-b border-neutral-200">
              <td className="py-1.5 font-mono text-xs">{b.box}</td>
              <td className="py-1.5">{b.label}</td>
              <td className="py-1.5 text-right tabular-nums">{n2(b.amount)}</td>
              <td className="py-1.5 text-right tabular-nums">{n2(b.vat)}</td>
              <td className="py-1.5 text-right tabular-nums">{b.adjustment === undefined ? "" : n2(b.adjustment)}</td>
            </tr>
          ))}
          <tr className="border-b-2 border-neutral-800 font-semibold">
            <td className="py-2 font-mono text-xs">{total.box}</td>
            <td className="py-2">Totals</td>
            <td className="py-2 text-right tabular-nums">{n2(total.amount)}</td>
            <td className="py-2 text-right tabular-nums">{n2(total.vat)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </>
  )
}

function NetRow({ box, label, value }: { box: string; label: string; value: number }) {
  return (
    <tr className="border-b border-neutral-200">
      <td className="w-12 py-2 font-mono text-xs">{box}</td>
      <td className="py-2">{label}</td>
      <td className="py-2 text-right tabular-nums">{formatCurrency(value)}</td>
    </tr>
  )
}

function Register({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <>
      <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {title} ({rows.length})
      </h3>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-300 text-left uppercase tracking-wide text-neutral-500">
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 pr-2 font-semibold ${i >= 4 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="py-3 text-neutral-500">
                None in this period.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={idx} className="border-b border-neutral-100">
                {r.map((c, i) => (
                  <td key={i} className={`py-1.5 pr-2 ${i >= 4 ? "text-right tabular-nums" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  )
}
