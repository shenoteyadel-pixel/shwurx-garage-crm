import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { ctxCanAny, getSessionContext } from "@/lib/rbac/context"

export type AssignableStaff = {
  id: string
  full_name: string | null
  role: string
  job_title: string | null
  skills: string[]
}

/**
 * Active staff who can be put on a job card (advisors, mechanics, denters,
 * painters, ...). profiles RLS only exposes a user's own row unless they manage
 * users, so this reads through the service client — but only for callers who
 * may create or assign jobs, and only name/role/trade columns.
 */
export async function getAssignableStaff(): Promise<AssignableStaff[]> {
  const ctx = await getSessionContext()
  if (!ctx?.isStaff || !ctxCanAny(ctx, ["jobs.assign", "jobs.create", "jobs.edit"])) return []

  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("id, full_name, role, job_title, skills")
    .neq("role", "customer")
    .eq("is_active", true)
    .order("full_name")
  if (error) return []

  return (data ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    role: s.role,
    job_title: s.job_title ?? null,
    skills: (s.skills ?? []) as string[],
  }))
}
