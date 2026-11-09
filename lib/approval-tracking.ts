import { randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"

type ApprovalSource = { kind: "job"; token: string } | { kind: "request"; token: string }

/**
 * Resolve (or mint) the customer's live tracking link from an approval link.
 * Holding the approval token already grants access to this job, so handing the
 * customer their own tracking link here does not widen what they can see.
 * Returns a relative path like `/track/<token>`, or null if it can't be resolved.
 */
export async function trackingPathForApproval(source: ApprovalSource): Promise<string | null> {
  if (!source.token) return null
  try {
    const svc = createServiceClient()

    let jobId: string | null = null
    if (source.kind === "request") {
      const { data } = await svc.from("approval_requests").select("job_id").eq("token", source.token).maybeSingle()
      jobId = (data?.job_id as string) ?? null
    }

    const jobQuery = svc.from("jobs").select("customer_id")
    const { data: job } = jobId
      ? await jobQuery.eq("id", jobId).maybeSingle()
      : source.kind === "job"
        ? await jobQuery.eq("approval_token", source.token).maybeSingle()
        : { data: null }

    const customerId = (job?.customer_id as string) ?? null
    if (!customerId) return null

    const { data: live } = await svc
      .from("customer_portal_tokens")
      .select("token, expires_at, expiry_mode")
      .eq("customer_id", customerId)
      .eq("revoked", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (live) {
      const stillValid =
        live.expiry_mode === "while_open" || new Date(live.expires_at as string).getTime() > Date.now()
      if (stillValid) return `/track/${live.token}`
    }

    const token = randomBytes(24).toString("base64url")
    const { error } = await svc.from("customer_portal_tokens").insert({
      customer_id: customerId,
      token,
      expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
      expiry_mode: "while_open",
    })
    if (error) return null
    return `/track/${token}`
  } catch {
    return null
  }
}
