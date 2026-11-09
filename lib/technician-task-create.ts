import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_CHECKLIST } from "@/lib/technician-tasks"

const CLOSED_STAGES = ["delivered"]

/** Creates an open task for this technician on this job unless one already exists. Returns the task id when created. */
export async function ensureTechnicianTask(
  supabase: SupabaseClient,
  jobId: string,
  technicianId: string,
  opts: { trade?: string | null } = {},
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("technician_tasks")
    .select("id")
    .eq("job_id", jobId)
    .eq("technician_id", technicianId)
    .neq("status", "qc_approved")
    .limit(1)
  if (existing?.length) return null

  const { data: job } = await supabase.from("jobs").select("complaint, stage").eq("id", jobId).maybeSingle()
  if (!job || CLOSED_STAGES.includes(job.stage)) return null

  const title = (job.complaint?.trim() || "Inspect and repair vehicle").slice(0, 200)
  const { data, error } = await supabase
    .from("technician_tasks")
    .insert({
      job_id: jobId,
      technician_id: technicianId,
      title,
      trade: opts.trade ?? null,
      priority: "normal",
      checklist: DEFAULT_CHECKLIST,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id
}
