import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyPermissionHolders, notifyUserIds } from "@/lib/job-notify"

const OPEN_STATUSES = ["assigned", "inspection", "in_progress", "waiting_parts", "waiting_approval", "qc_rejected", "repair_completed"]

type OverdueRow = {
  id: string
  title: string
  technician_id: string
  deadline: string
  delay_reason: string | null
  jobs: { id: string; job_number: string | null; master_technician_id: string | null; deleted_at: string | null }
}

/**
 * Notifies the technician, the job's Master Technician and workshop managers
 * once per overdue task. Clearing or moving the deadline re-arms it.
 */
export async function runTaskEscalation() {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("technician_tasks")
    .select("id, title, technician_id, deadline, delay_reason, jobs!inner(id, job_number, master_technician_id, deleted_at)")
    .in("status", OPEN_STATUSES)
    .lt("deadline", new Date().toISOString())
    .is("overdue_notified_at", null)
    .limit(200)
    .returns<OverdueRow[]>()
  if (error) throw error

  let escalated = 0
  for (const task of data ?? []) {
    if (task.jobs.deleted_at) continue
    // Claim first so overlapping runs never double-notify.
    const { data: claimed } = await svc
      .from("technician_tasks")
      .update({ overdue_notified_at: new Date().toISOString() })
      .eq("id", task.id)
      .is("overdue_notified_at", null)
      .select("id")
    if (!claimed?.length) continue

    const job = task.jobs.job_number ?? ""
    const due = new Date(task.deadline).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })
    const reason = task.delay_reason ? ` Reason given: ${task.delay_reason}` : " No delay reason given yet."
    await notifyUserIds([task.technician_id], {
      title: `Overdue: ${task.title}`,
      body: `Job ${job} was due ${due}. Add a delay reason if you are blocked.`,
      type: "job",
      link: `/technician/tasks/${task.id}`,
    })
    const leads = { title: `Task overdue on job ${job}`, body: `${task.title} was due ${due}.${reason}`, type: "job" }
    if (task.jobs.master_technician_id && task.jobs.master_technician_id !== task.technician_id) {
      await notifyUserIds([task.jobs.master_technician_id], { ...leads, link: "/master" })
    }
    await notifyPermissionHolders(["jobs.override_master"], { ...leads, link: `/jobs/${task.jobs.id}` })
    escalated++
  }
  return { checked: data?.length ?? 0, escalated }
}
