import { createClient } from "@/lib/supabase/server"
import { requireAnyPermission, ForbiddenError, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Guard for hands-on workshop work (inspection, diagnosis, parts requests).
 * Passes for users holding any of `anyOf`. Users who can't see every job
 * (e.g. technicians) must also be assigned to the job: the jobs RLS policy
 * only returns jobs they're assigned to, so a missing row means no access.
 */
export async function requireJobWork(
  anyOf: Permission[],
  jobId?: string | null,
): Promise<{ supabase: Supabase; ctx: SessionContext }> {
  const ctx = await requireAnyPermission(anyOf)
  const supabase = await createClient()
  if (jobId) await assertJobAccess(supabase, ctx, jobId)
  return { supabase, ctx }
}

export async function assertJobAccess(supabase: Supabase, ctx: SessionContext, jobId: string) {
  if (!jobId) throw new Error("Missing job")
  if (ctx.permissions.has("jobs.view_all") || ctx.permissions.has("jobs.edit")) return
  const { data } = await supabase.from("jobs").select("id").eq("id", jobId).maybeSingle()
  if (!data) throw new ForbiddenError("jobs.view_assigned")
}
