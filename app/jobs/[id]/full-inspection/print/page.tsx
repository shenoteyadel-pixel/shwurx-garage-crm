import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { DocHeader, DocWatermark, DocBrandStrip } from "@/components/doc-header"
import { PrintButton } from "@/components/print-button"
import { formatDate } from "@/lib/utils"
import {
  CHECK_STATUSES,
  CHECK_STATUS_MAP,
  FULL_INSPECTION_SECTIONS,
  checklistTally,
  normalizeChecklist,
  overallVerdict,
} from "@/lib/full-inspection-config"

export const metadata = { title: "Vehicle Inspection Report" }

export default async function FullInspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [settings, { data: job }, { data: inspection }] = await Promise.all([
    getSettings(),
    supabase.from("jobs").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("vehicle_inspections")
      .select("status, checklist, summary, recommendations, odometer, completed_at, updated_at, created_at")
      .eq("job_id", id)
      .eq("inspection_type", "full")
      .maybeSingle(),
  ])
  if (!job || !inspection) notFound()

  const checklist = normalizeChecklist(inspection.checklist)
  const tally = checklistTally(checklist)
  const verdict = overallVerdict(checklist)
  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const reportDate = inspection.completed_at ?? inspection.updated_at ?? inspection.created_at
  const flagged = FULL_INSPECTION_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => {
        const s = checklist[item.key]?.status
        return s === "urgent" || s === "attention"
      })
      .map((item) => ({ section: section.title, item, entry: checklist[item.key] })),
  ).sort((a, b) => (a.entry.status === "urgent" ? 0 : 1) - (b.entry.status === "urgent" ? 0 : 1))

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <a href={`/jobs/${id}`} className="text-sm text-neutral-600 hover:text-neutral-900">
          ← Back to job
        </a>
        <PrintButton />
      </div>

      <div className="relative isolate mx-auto max-w-[820px] bg-white px-10 py-10 text-neutral-900 shadow-lg print:max-w-none print:px-8 print:shadow-none">
        <DocWatermark settings={settings} />
        <DocHeader
          settings={settings}
          title="Vehicle Inspection Report"
          number={job.job_number}
          date={formatDate(reportDate)}
        />

        {inspection.status !== "completed" && (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Draft: this inspection has not been marked complete yet.
          </p>
        )}

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
              {[
                job.plate_number ? `Plate ${job.plate_number}` : null,
                inspection.odometer ? `${Number(inspection.odometer).toLocaleString()} km` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {job.vin && <div className="font-mono text-xs text-neutral-500">VIN {job.vin}</div>}
          </div>
        </div>

        <div className="flex items-stretch gap-4 rounded-lg border border-neutral-200 p-4 [break-inside:avoid]">
          <div className="flex flex-1 flex-col justify-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Overall condition</div>
            <div className="mt-1 text-xl font-bold" style={{ color: verdict.hex }}>
              {verdict.label}
            </div>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              {(["good", "attention", "urgent", "na"] as const).map((s) =>
                tally[s] > 0 ? (
                  <span
                    key={s}
                    style={{ width: `${(tally[s] / tally.total) * 100}%`, backgroundColor: CHECK_STATUS_MAP[s].hex }}
                  />
                ) : null,
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["good", "attention", "urgent"] as const).map((s) => (
              <div key={s} className="flex w-20 flex-col justify-center rounded-md bg-neutral-50 px-2 py-2">
                <div className="text-2xl font-bold tabular-nums" style={{ color: CHECK_STATUS_MAP[s].hex }}>
                  {tally[s]}
                </div>
                <div className="text-[10px] font-medium uppercase leading-tight text-neutral-500">
                  {CHECK_STATUS_MAP[s].label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {inspection.summary && (
          <>
            <SectionTitle>Inspector summary</SectionTitle>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{inspection.summary}</p>
          </>
        )}

        {flagged.length > 0 && (
          <>
            <SectionTitle>Items requiring attention</SectionTitle>
            <ul className="flex flex-col gap-2">
              {flagged.map(({ section, item, entry }) => {
                const meta = CHECK_STATUS_MAP[entry.status!]
                return (
                  <li
                    key={item.key}
                    className="flex gap-3 rounded-md border border-neutral-200 p-3 text-sm [break-inside:avoid]"
                    style={{ borderLeftColor: meta.hex, borderLeftWidth: 4 }}
                  >
                    <div className="flex-1">
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-xs text-neutral-500">{section}</div>
                      {entry.note && <div className="mt-1 text-neutral-700">{entry.note}</div>}
                    </div>
                    <span className="h-fit shrink-0 text-xs font-bold uppercase" style={{ color: meta.hex }}>
                      {meta.short}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <SectionTitle>Full inspection checklist</SectionTitle>
        <div className="flex flex-col gap-4">
          {FULL_INSPECTION_SECTIONS.map((section) => (
            <table key={section.key} className="w-full border-collapse text-sm [break-inside:avoid]">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  <th className="py-1.5 pr-2 text-xs font-bold text-neutral-800">{section.title}</th>
                  <th className="w-24 py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Result
                  </th>
                  <th className="py-1.5 pl-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => {
                  const entry = checklist[item.key]
                  const meta = entry?.status ? CHECK_STATUS_MAP[entry.status] : null
                  return (
                    <tr key={item.key} className="border-b border-neutral-100 align-top">
                      <td className="py-1.5 pr-2">{item.label}</td>
                      <td className="py-1.5 px-2">
                        {meta ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.hex }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.hex }} />
                            {meta.short}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">Not inspected</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-2 text-neutral-600">{entry?.note || ""}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-600">
          {CHECK_STATUSES.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.hex }} />
              {s.short} = {s.label}
            </span>
          ))}
        </div>

        {inspection.recommendations && (
          <div className="mt-6 rounded-md bg-neutral-50 p-4 text-sm [break-inside:avoid]">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#3f9a0c]">Recommendations</div>
            <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{inspection.recommendations}</p>
          </div>
        )}

        <DocBrandStrip />
        <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
          This report reflects the condition of the vehicle at the time of inspection. It is not a warranty.
          <br />
          Thank you for choosing SHWURX Auto Service Center.
        </div>
      </div>
    </main>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-[#3f9a0c]">{children}</div>
}
