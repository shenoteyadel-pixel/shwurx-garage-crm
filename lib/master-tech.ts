import { ctxCan, type SessionContext } from "@/lib/rbac/context"

/** Roles that can lead a job card or receive technician tasks. */
export const MASTER_ELIGIBLE_ROLES: string[] = ["master_technician", "technician", "workshop_supervisor"]

/** Throws unless the caller is the job's Master Technician or a workshop manager. */
export function assertTaskLead(ctx: SessionContext, masterTechnicianId: string | null) {
  if (ctxCan(ctx, "jobs.assign")) return
  if (ctxCan(ctx, "tasks.assign") && masterTechnicianId === ctx.userId) return
  throw new Error("Only this job's Master Technician or a workshop manager can do this.")
}
