import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PrintButton } from "@/components/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

type SnapItem = {
  key: string
  kind: "part" | "labor"
  name: string
  part_number: string | null
  detail: string | null
  category: string | null
  recommendation: string
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  net: number
  vat: number
  gross: number
}

export default async function ApprovalCertificatePage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>
}) {
  const { id, requestId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: req } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .eq("job_id", id)
    .maybeSingle()
  if (!req) notFound()

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!job) notFound()

  const { data: decisionRows } = await supabase
    .from("approval_item_decisions")
    .select("item_key, decision")
    .eq("approval_request_id", requestId)
  const decisionMap = new Map<string, string>((decisionRows ?? []).map((d) => [d.item_key, d.decision]))

  const items = ((req.snapshot as any)?.items ?? []) as SnapItem[]
  const isWhole = req.mode === "whole"
  const wholeDecision = decisionMap.get("__whole__")
  const decisionFor = (it: SnapItem) => (isWhole ? wholeDecision ?? "rejected" : decisionMap.get(it.key) ?? "rejected")

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const decided = req.decided_at ? formatDate(req.decided_at) : "—"
  const statusLabel =
    req.status === "approved"
      ? "Fully approved"
      : req.status === "partial"
        ? "Partially approved"
        : req.status === "rejected"
          ? "Declined"
          : String(req.status)

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/jobs/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to job
        </a>
        <PrintButton />
      </div>

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
            <div className="text-lg font-bold uppercase tracking-wide">Approval Certificate</div>
            <p className="mt-1 font-mono text-sm text-neutral-600">
              {job.job_number} · v{req.version}
            </p>
            <p className="text-xs text-neutral-500">{decided}</p>
          </div>
        </div>

        {/* Parties + status */}
        <div className="grid grid-cols-3 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Customer</div>
            <div className="font-semibold">{job.customer_name}</div>
            <div className="text-neutral-600">{job.customer_mobile}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Vehicle</div>
            <div className="font-semibold">{vehicle}</div>
            <div className="text-neutral-600">
              {job.plate_number ? `Plate ${job.plate_number}` : ""}
              {job.vin ? ` · VIN ${job.vin}` : ""}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Outcome</div>
            <div
              className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                req.status === "rejected"
                  ? "bg-red-100 text-red-700"
                  : req.status === "partial"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {statusLabel}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {req.kind === "additional_work" ? "Additional work" : "Quotation"}
            </div>
          </div>
        </div>

        {/* Decisions table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 px-2 text-left font-semibold">Category</th>
              <th className="py-2 px-2 text-right font-semibold">Amount</th>
              <th className="py-2 pl-2 text-right font-semibold">Decision</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const d = decisionFor(it)
              return (
                <tr key={it.key} className="border-b border-neutral-200 align-top">
                  <td className="py-3 pr-2">
                    <div className="font-medium">{it.name}</div>
                    {it.part_number && <div className="font-mono text-xs text-neutral-500">#{it.part_number}</div>}
                    {it.detail && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{it.detail}</p>}
                  </td>
                  <td className="py-3 px-2 text-neutral-600">
                    {it.category || (it.kind === "part" ? "Parts" : "Labour")}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(Number(it.gross))}</td>
                  <td className="py-3 pl-2 text-right">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        d === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {d === "approved" ? "Approved" : "Declined"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Approved totals */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <TotalRow label="Approved subtotal" value={formatCurrency(Number(req.approved_subtotal ?? 0))} />
            <TotalRow label={`VAT (${req.vat_rate}%)`} value={formatCurrency(Number(req.approved_vat ?? 0))} />
            <div className="flex items-center justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
              <span>Approved total</span>
              <span className="tabular-nums">{formatCurrency(Number(req.approved_total ?? 0))}</span>
            </div>
          </div>
        </div>

        {/* Signature block */}
        <div className="mt-10 grid grid-cols-2 gap-8 border-t border-neutral-200 pt-6">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Customer signature
            </div>
            {req.signer_signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={req.signer_signature || "/placeholder.svg"}
                alt="Customer signature"
                className="h-24 w-full max-w-[240px] rounded border border-neutral-200 bg-white object-contain"
              />
            ) : (
              <div className="flex h-24 w-full max-w-[240px] items-center justify-center rounded border border-dashed border-neutral-300 text-xs text-neutral-400">
                No signature
              </div>
            )}
            <div className="mt-2 text-sm font-semibold">{req.signer_name || job.customer_name}</div>
            {req.signer_comment && (
              <p className="mt-1 max-w-[260px] text-xs italic leading-relaxed text-neutral-500">
                “{req.signer_comment}”
              </p>
            )}
          </div>
          <div className="text-xs text-neutral-500">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Audit record
            </div>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3">
                <dt>Signed at</dt>
                <dd className="text-right text-neutral-700">{decided}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>IP address</dt>
                <dd className="text-right font-mono text-neutral-700">{req.signed_ip || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Reference</dt>
                <dd className="text-right font-mono text-neutral-700">{String(req.id).slice(0, 8)}</dd>
              </div>
            </dl>
            {req.signed_user_agent && (
              <p className="mt-2 break-words leading-relaxed text-[10px] text-neutral-400">{req.signed_user_agent}</p>
            )}
          </div>
        </div>

        <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
          This certificate records the customer&apos;s digitally-signed authorization. Only approved items will be
          carried out and invoiced.
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
