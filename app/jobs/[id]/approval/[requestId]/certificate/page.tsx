import { notFound, redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
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

  const settings = await getSettings()

  // Lazily assign a permanent certificate number for any decided request.
  let certificateNumber: string | null = req.certificate_number ?? null
  const isDecided = ["approved", "partial", "rejected"].includes(String(req.status))
  if (!certificateNumber && isDecided) {
    try {
      const svc = createServiceClient()
      const { data: assigned } = await svc.rpc("assign_certificate_number", { p_request_id: requestId })
      if (typeof assigned === "string") certificateNumber = assigned
    } catch (e) {
      console.log("[v0] assign_certificate_number failed:", (e as Error).message)
    }
  }

  const { data: decisionRows } = await supabase
    .from("approval_item_decisions")
    .select("item_key, decision")
    .eq("approval_request_id", requestId)
  const decisionMap = new Map<string, string>((decisionRows ?? []).map((d) => [d.item_key, d.decision]))

  const items = ((req.snapshot as any)?.items ?? []) as SnapItem[]
  const isWhole = req.mode === "whole"
  const wholeDecision = decisionMap.get("__whole__")
  const decisionFor = (it: SnapItem) => (isWhole ? wholeDecision ?? "rejected" : decisionMap.get(it.key) ?? "rejected")

  const approvedItems = items.filter((it) => decisionFor(it) === "approved")
  const declinedItems = items.filter((it) => decisionFor(it) !== "approved")

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

  const legalName = settings.legal_name || settings.company_name
  const brand = settings.company_name && settings.company_name !== legalName ? settings.company_name : null

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/jobs/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to job
        </a>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        {/* Header — legal entity is primary */}
        <div className="flex items-start justify-between border-b-2 border-[#e51f2b] pb-5">
          <div>
            <div className="text-xl font-extrabold uppercase leading-tight tracking-tight">{legalName}</div>
            {brand && <p className="mt-0.5 text-xs font-medium text-[#e51f2b]">{brand}</p>}
            <div className="mt-1.5 space-y-0.5 text-[11px] text-neutral-500">
              {settings.address && <div>{settings.address}</div>}
              <div className="flex flex-wrap gap-x-3">
                {settings.phone && <span>Tel {settings.phone}</span>}
                {settings.email && <span>{settings.email}</span>}
              </div>
              {(settings.trade_license || settings.trn) && (
                <div className="flex flex-wrap gap-x-3 pt-0.5 font-medium text-neutral-700">
                  {settings.trade_license && <span>Trade License: {settings.trade_license}</span>}
                  {settings.trn && <span>TRN: {settings.trn}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold uppercase tracking-wide">Approval Certificate</div>
            {certificateNumber && <p className="mt-1 font-mono text-sm font-semibold">{certificateNumber}</p>}
            <p className="mt-0.5 font-mono text-xs text-neutral-600">
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
              {job.mileage ? ` · ${Number(job.mileage).toLocaleString()} km` : ""}
            </div>
            {job.vin && <div className="font-mono text-[11px] text-neutral-500">VIN {job.vin}</div>}
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

        {/* Approved items */}
        <ItemSection
          title="Approved — authorized for work"
          tone="approved"
          items={approvedItems}
          emptyText="No items were approved."
        />

        {/* Declined items */}
        {declinedItems.length > 0 && (
          <ItemSection
            title="Declined — not authorized"
            tone="declined"
            items={declinedItems}
            emptyText=""
          />
        )}

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

        {/* Declaration */}
        <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
          <span className="font-semibold text-neutral-800">Customer declaration:</span> I authorize{" "}
          {legalName} to carry out only the items marked <strong>Approved</strong> above at the stated prices
          (inclusive of {req.vat_rate}% VAT where applicable). I understand declined items will not be performed or
          invoiced. This authorization was captured electronically with my signature below.
        </div>

        {/* Signature block */}
        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-neutral-200 pt-6">
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
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Audit record</div>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3">
                <dt>Certificate</dt>
                <dd className="text-right font-mono text-neutral-700">{certificateNumber || "—"}</dd>
              </div>
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
          {brand && (
            <>
              <br />
              Thank you for choosing {brand}.
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function ItemSection({
  title,
  tone,
  items,
  emptyText,
}: {
  title: string
  tone: "approved" | "declined"
  items: SnapItem[]
  emptyText: string
}) {
  return (
    <div className="mt-5">
      <div
        className={`mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide ${
          tone === "approved" ? "text-emerald-700" : "text-red-700"
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone === "approved" ? "bg-emerald-500" : "bg-red-500"}`}
        />
        {title}
      </div>
      {items.length === 0 ? (
        emptyText ? <p className="text-xs text-neutral-400">{emptyText}</p> : null
      ) : (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {items.map((it) => (
              <tr key={it.key} className="border-b border-neutral-200 align-top">
                <td className="py-2.5 pr-2">
                  <div className="font-medium">{it.name}</div>
                  {it.part_number && <div className="font-mono text-xs text-neutral-500">#{it.part_number}</div>}
                  {it.detail && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{it.detail}</p>}
                </td>
                <td className="w-32 py-2.5 px-2 text-neutral-600">
                  {it.category || (it.kind === "part" ? "Parts" : "Labour")}
                </td>
                <td className="w-28 py-2.5 pl-2 text-right tabular-nums">{formatCurrency(Number(it.gross))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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
