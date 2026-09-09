"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requirePermission, type SessionContext } from "@/lib/rbac/context"
import type { Permission } from "@/lib/rbac/roles"
import { resyncQuotationAddons, ADDON_TYPES, type AddonType, type JobAddon } from "@/lib/addons"
import { syncPendingApproval } from "@/lib/actions-approvals"

async function guard(
  perm: Permission,
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; ctx: SessionContext }> {
  const ctx = await requirePermission(perm)
  const supabase = await createClient()
  return { supabase, ctx }
}

export async function getJobAddons(jobId: string): Promise<JobAddon[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("job_addons")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
  return (data as JobAddon[] | null) ?? []
}

export type UpsertAddonInput = {
  jobId: string
  type: AddonType
  enabled: boolean
  billable: boolean
  price: number
  status?: "pending" | "completed"
  notes?: string | null
}

/**
 * Create or update one add-on service for a job, then re-materialise the linked
 * quotation lines and refresh any pending customer approval. If the quote was
 * already approved, the standard "changed since sent" detection will surface an
 * Additional Work re-approval — the charge itself is preserved either way.
 */
export async function upsertJobAddon(input: UpsertAddonInput) {
  const { supabase } = await guard("quotations.create")

  if (!ADDON_TYPES.includes(input.type)) throw new Error("Invalid add-on type")
  const price = Number.isFinite(input.price) ? Math.max(0, Number(input.price)) : 0

  const { error } = await supabase
    .from("job_addons")
    .upsert(
      {
        job_id: input.jobId,
        type: input.type,
        enabled: input.enabled,
        billable: input.billable,
        price,
        status: input.status ?? "pending",
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id,type" },
    )
  if (error) throw new Error(error.message)

  // Materialise onto the quotation (creating a minimal quote if the add-on is
  // the first billable thing on the job), then keep the approval link current.
  await resyncQuotationAddons(supabase, input.jobId, { createIfMissing: true })
  try {
    await syncPendingApproval(input.jobId)
  } catch {
    // best-effort
  }

  revalidatePath(`/jobs/${input.jobId}`)
}

/** Toggle only the completion status of an add-on. Never affects its price. */
export async function setJobAddonStatus(jobId: string, type: AddonType, status: "pending" | "completed") {
  const { supabase } = await guard("jobs.update_status")
  const { error } = await supabase
    .from("job_addons")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("type", type)
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}
