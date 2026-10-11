import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { sendPushToUsers } from "@/lib/push"

type Payload = { title: string; body?: string; type?: string; link?: string }

async function deliver(userIds: Iterable<string | null | undefined>, payload: Payload) {
  const ids = [...new Set([...userIds].filter((x): x is string => Boolean(x)))]
  if (!ids.length) return
  const svc = createServiceClient()
  const { data: active } = await svc.from("profiles").select("id").in("id", ids).eq("is_active", true)
  const to = (active ?? []).map((p) => p.id as string)
  if (!to.length) return
  await svc.from("notifications").insert(
    to.map((user_id) => ({
      user_id,
      title: payload.title,
      body: payload.body ?? null,
      type: payload.type ?? "info",
      link: payload.link ?? null,
    })),
  )
  await sendPushToUsers(to, payload)
}

async function usersWithAnyPermission(permissions: string[]) {
  const svc = createServiceClient()
  const { data: roleRows } = await svc
    .from("role_permissions")
    .select("role")
    .in("permission", permissions)
    .eq("allowed", true)
  const roles = [...new Set((roleRows ?? []).map((r) => r.role))]
  if (!roles.length) return []
  const { data: users } = await svc.from("profiles").select("id").in("role", roles).eq("is_active", true)
  return (users ?? []).map((u) => u.id as string)
}

async function jobInfo(jobId: string) {
  const svc = createServiceClient()
  const [{ data: job }, { data: team }] = await Promise.all([
    svc.from("jobs").select("job_number, advisor_id, technician_id").eq("id", jobId).maybeSingle(),
    svc.from("job_technicians").select("user_id").eq("job_id", jobId),
  ])
  return {
    label: (job?.job_number as string | null) ?? jobId.slice(0, 8),
    advisorId: (job?.advisor_id as string | null) ?? null,
    technicianIds: [job?.technician_id as string | null, ...(team ?? []).map((t) => t.user_id as string)],
  }
}

/** Purchasing team (parts staff + purchase-order managers), each notified once. */
export async function notifyPurchasers(payload: Payload) {
  await deliver(await usersWithAnyPermission(["parts.manage", "purchase_orders.manage"]), payload)
}

/** Every technician on the job (lead + team) — e.g. parts arrived, ready to fit. */
export async function notifyJobTechnicians(jobId: string, build: (jobLabel: string) => Payload) {
  const job = await jobInfo(jobId)
  await deliver(job.technicianIds, build(job.label))
}

/** The job's service advisor, or every quotation editor when none is assigned. */
export async function notifyJobAdvisor(jobId: string, build: (jobLabel: string) => Payload) {
  const job = await jobInfo(jobId)
  const to = job.advisorId ? [job.advisorId] : await usersWithAnyPermission(["quotations.edit"])
  await deliver(to, build(job.label))
}
