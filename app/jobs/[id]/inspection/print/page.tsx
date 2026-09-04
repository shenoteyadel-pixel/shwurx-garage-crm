import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PrintButton } from "@/components/print-button"
import { formatDate } from "@/lib/utils"
import { DAMAGE_MAP } from "@/lib/inspection-config"
import { VehicleSchematic, INSPECTION_VIEWS } from "@/components/inspection/vehicle-schematics"
import type { MarkerView } from "@/lib/actions-inspections"

export default async function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!job) notFound()

  const { data: inspection } = await supabase
    .from("vehicle_inspections")
    .select("id, status, odometer, fuel_level, general_notes, signature_data_url, signed_by_name, signed_at, created_at")
    .eq("job_id", id)
    .eq("inspection_type", "check_in")
    .maybeSingle()
  if (!inspection) notFound()

  const { data: markerRows } = await supabase
    .from("inspection_markers")
    .select("id, view, x_pct, y_pct, damage_type, severity, location_label, note, position")
    .eq("inspection_id", inspection.id)
    .is("deleted_at", null)
    .order("position", { ascending: true })

  const markers = markerRows ?? []
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const byView = (v: MarkerView) => markers.filter((m) => m.view === v)

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
            <div className="text-lg font-bold uppercase tracking-wide">Vehicle Condition Report</div>
            <p className="mt-1 font-mono text-sm text-neutral-600">{job.job_number}</p>
            <p className="text-xs text-neutral-500">{formatDate(inspection.created_at)}</p>
          </div>
        </div>

        {/* Parties + condition */}
        <div className="grid grid-cols-2 gap-6 py-5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Customer</div>
            <div className="font-semibold">{job.customer_name}</div>
            <div className="text-neutral-600">{job.customer_mobile}</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Vehicle</div>
            <div className="font-semibold">{vehicle}</div>
            {(job.variant || job.color) && (
              <div className="text-neutral-600">{[job.variant, job.color].filter(Boolean).join(" · ")}</div>
            )}
            <div className="text-neutral-600">
              {job.plate_number ? `Plate ${job.plate_number}` : ""}
              {inspection.odometer ? ` · ${Number(inspection.odometer).toLocaleString()} km` : ""}
              {inspection.fuel_level ? ` · Fuel ${inspection.fuel_level}` : ""}
            </div>
            {job.vin && <div className="font-mono text-xs text-neutral-500">VIN {job.vin}</div>}
          </div>
        </div>

        {/* Diagrams */}
        <SectionTitle>Inspection Diagram</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {INSPECTION_VIEWS.map((v) => {
            const vm = byView(v.key)
            return (
              <div key={v.key} className="rounded-md border border-neutral-200 p-2">
                <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {v.label} {vm.length > 0 && `(${vm.length})`}
                </div>
                <div className="relative aspect-square w-full text-neutral-700">
                  <VehicleSchematic view={v.key} bodyType={job.body_type} />
                  {vm.map((m) => {
                    const d = DAMAGE_MAP[m.damage_type as keyof typeof DAMAGE_MAP]
                    return (
                      <span
                        key={m.id}
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                        style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%`, backgroundColor: d.hex }}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-600">
          {Object.values(DAMAGE_MAP).map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.hex }} />
              {d.label}
            </span>
          ))}
        </div>

        {/* Findings table */}
        <SectionTitle>Recorded Findings</SectionTitle>
        {markers.length === 0 ? (
          <p className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">
            No damage or condition items were recorded for this vehicle.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 px-2 font-semibold">View</th>
                <th className="py-2 px-2 font-semibold">Type</th>
                <th className="py-2 px-2 font-semibold">Severity</th>
                <th className="py-2 px-2 font-semibold">Location</th>
                <th className="py-2 pl-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {markers.map((m, i) => {
                const d = DAMAGE_MAP[m.damage_type as keyof typeof DAMAGE_MAP]
                return (
                  <tr key={m.id} className="border-b border-neutral-200 align-top">
                    <td className="py-2.5 pr-2 tabular-nums text-neutral-500">{i + 1}</td>
                    <td className="py-2.5 px-2 capitalize">{m.view}</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.hex }} />
                        {d.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 capitalize text-neutral-600">{m.severity || "—"}</td>
                    <td className="py-2.5 px-2 text-neutral-600">{m.location_label || "—"}</td>
                    <td className="py-2.5 pl-2 text-neutral-600">{m.note || "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* General notes */}
        {inspection.general_notes && (
          <div className="mt-5 rounded-md bg-neutral-50 p-4 text-sm">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              General notes
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{inspection.general_notes}</p>
          </div>
        )}

        {/* Signature */}
        <div className="mt-8 flex items-end justify-between gap-6">
          <div className="text-xs text-neutral-500">
            <p>
              I confirm the above condition record reflects the state of the vehicle at check-in and authorise the
              recorded inspection.
            </p>
          </div>
          <div className="w-56 shrink-0 text-center">
            {inspection.signature_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={inspection.signature_data_url || "/placeholder.svg"}
                alt="Customer signature"
                className="mx-auto h-16 object-contain"
              />
            ) : (
              <div className="h-16" />
            )}
            <div className="border-t border-neutral-400 pt-1 text-xs text-neutral-600">
              {inspection.signed_by_name || job.customer_name || "Customer signature"}
              {inspection.signed_at ? ` · ${formatDate(inspection.signed_at)}` : ""}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
          This condition report documents pre-existing damage recorded at vehicle check-in.
          <br />
          Thank you for choosing SHWURX Auto Service Center.
        </div>
      </div>
    </main>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-[#e51f2b]">{children}</div>
}
