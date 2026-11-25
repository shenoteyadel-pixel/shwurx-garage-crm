import { ctxCan, type SessionContext } from "@/lib/rbac/context"
import { tradeFromTitle } from "@/lib/trades"

/** Roles that can lead a job card or receive technician tasks. */
export const MASTER_ELIGIBLE_ROLES: string[] = ["master_technician", "ep_manager", "technician", "workshop_supervisor"]

/** The Master Technician leads mechanical and electrical work only; dent and paint stay with workshop managers. */
export const MASTER_TASK_TRADES = ["Mechanical", "Electrical", "AC", "Diagnosis"]

export function isMasterTeamMember(p: { role: string; job_title: string | null }) {
  if (!["technician", "ep_manager", "master_technician"].includes(p.role)) return false
  const trade = tradeFromTitle(p.job_title)
  return trade === "mechanic" || trade === "electrician"
}

/** Throws unless the caller is the job's Master Technician or a workshop manager. */
export function assertTaskLead(ctx: SessionContext, masterTechnicianId: string | null) {
  if (ctxCan(ctx, "jobs.assign")) return
  if (ctxCan(ctx, "tasks.assign") && masterTechnicianId === ctx.userId) return
  throw new Error("Only this job's Master Technician or a workshop manager can do this.")
}
