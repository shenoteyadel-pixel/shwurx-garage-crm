import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { STAGE_MAP, type Stage } from "@/lib/constants"
import { CHECK_LABELS, getStageRules, type RequiredCheck } from "@/lib/workflow"

export const metadata = { title: "Workflow review" }

type JobRow = {
  id: string
  job_number: string | null
  stage: Stage
  complaint: string | null
  diagnosis: string | null
  technician_id: string | null
  qc_status: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  updated_at: string | null
}

export default async function WorkflowReviewPage() {
  const supabase = await createClient()
  const rules = await getStageRules()
  const since = new Date(Date.now() - 90 * 86400_000).toISOString()

  const [{ data: active }, { data: delivered }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, stage, complaint, diagnosis, technician_id, qc_status, vehicle_make, vehicle_model, updated_at")
      .neq("stage", "delivered")
      .limit(1000),
    supabase
      .from("jobs")
      .select("id, job_number, stage, complaint, diagnosis, technician_id, qc_status, vehicle_make, vehicle_model, updated_at")
      .eq("stage", "delivered")
      .gte("updated_at", since)
      .limit(1000),
  ])
  const jobs = [...((active ?? []) as JobRow[]), ...((delivered ?? []) as JobRow[])]

  const ids = jobs.filter((j) => !j.technician_id).map((j) => j.id)
  const { data: techRows } = ids.length
    ? await supabase.from("job_technicians").select("job_id").in("job_id", ids)
    : { data: [] as { job_id: string }[] }
  const hasTech = new Set((techRows ?? []).map((r) => r.job_id))

  const rows = jobs
    .map((job) => {
      const checks = (rules.get(job.stage)?.required_checks ?? []) as RequiredCheck[]
      const failed = checks.filter((c) => {
        if (c === "complaint") return !job.complaint?.trim()
        if (c === "diagnosis") return !job.diagnosis?.trim()
        if (c === "qc_passed") return job.qc_status !== "passed"
        if (c === "technician") return !job.technician_id && !hasTech.has(job.id)
        return false
      })
      return { job, failed }
    })
    .filter((r) => r.failed.length > 0)
    .sort((a, b) => (b.job.updated_at ?? "").localeCompare(a.job.updated_at ?? ""))

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-balance text-xl font-semibold">Workflow review</h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Jobs already sitting in a stage whose rules they don&apos;t meet. These were moved before the rules existed.
          Nothing here is changed automatically. Open each job to fix the missing details, or leave it as it is.
          Delivered jobs from the last 90 days are included.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Every job meets the rules for its current stage.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Jobs that fail their current stage rules</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Job</th>
                <th scope="col" className="px-4 py-3 font-medium">Stage</th>
                <th scope="col" className="px-4 py-3 font-medium">Missing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, failed }) => (
                <tr key={job.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${job.id}`} className="font-mono font-medium underline-offset-2 hover:underline">
                      {job.job_number ?? job.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{STAGE_MAP[job.stage]?.label ?? job.stage}</td>
                  <td className="px-4 py-3">
                    <ul className="flex flex-col gap-1">
                      {failed.map((c) => (
                        <li key={c} className={c === "qc_passed" ? "text-destructive" : "text-amber-400"}>
                          {CHECK_LABELS[c]}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "job" : "jobs"} to review
          </p>
        </div>
      )}
    </main>
  )
}
