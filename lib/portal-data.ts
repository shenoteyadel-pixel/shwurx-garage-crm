import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { STAGE_MAP, STAGE_ORDER, type Stage } from "@/lib/constants"

export interface PortalJob {
  id: string
  job_number: string | null
  stage: Stage
  stage_label: string
  vehicle_label: string
  plate: string | null
  created_at: string
  updated_at: string | null
}

export interface PortalInvoice {
  id: string
  invoice_number: string | null
  status: string | null
  total: number | null
  amount_paid: number | null
  created_at: string
}

export interface PortalData {
  customer: { id: string; full_name: string; phone: string | null }
  jobs: PortalJob[]
  invoices: PortalInvoice[]
}

/** Lifecycle of a tracking link, driven by the customer's job state. */
export type TrackingStatus = "active" | "completed" | "expired"

export interface TrackingResult {
  status: TrackingStatus
  data: PortalData
}

/** A job is "open" until it has been delivered. */
function hasOpenJob(data: PortalData): boolean {
  return data.jobs.some((j) => j.stage !== "delivered")
}

/**
 * Resolve a tracking token into a lifecycle status + customer-safe data.
 * Returns null ONLY when the token is missing or revoked — an expired link
 * still resolves (status "expired") so we can show a friendly notice with a
 * link to the customer portal instead of a dead end.
 *
 * Expiry rules:
 *  - expiry_mode "while_open" (default): the link NEVER expires while the
 *    customer still has an open job. Once every job is delivered, the
 *    owner-configured grace window (expires_at, stamped at delivery) applies.
 *  - expiry_mode "fixed" (legacy): expires_at is an absolute deadline.
 */
export async function resolveTrackingToken(token: string): Promise<TrackingResult | null> {
  if (!token) return null
  const svc = createServiceClient()

  const { data: row } = await svc
    .from("customer_portal_tokens")
    .select("customer_id, expires_at, revoked, expiry_mode")
    .eq("token", token)
    .maybeSingle()

  if (!row || row.revoked) return null

  const data = await loadPortalDataByCustomer(row.customer_id as string)
  if (!data) return null

  const open = hasOpenJob(data)
  const mode = (row.expiry_mode as string) ?? "while_open"
  const deadline = row.expires_at ? new Date(row.expires_at as string).getTime() : null

  let expired = false
  if (mode === "while_open") {
    // Only a delivered-and-past-grace link can expire.
    expired = !open && deadline !== null && deadline < Date.now()
  } else {
    expired = deadline !== null && deadline < Date.now()
  }

  // Best-effort freshness marker (never blocks).
  await svc
    .from("customer_portal_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token)
    .then(undefined, () => {})

  const status: TrackingStatus = expired ? "expired" : open ? "active" : "completed"
  return { status, data }
}

/**
 * Backwards-compatible resolver returning customer-safe data or null when the
 * link is invalid, revoked, or fully expired.
 */
export async function resolvePortalToken(token: string): Promise<PortalData | null> {
  const result = await resolveTrackingToken(token)
  if (!result || result.status === "expired") return null
  return result.data
}

/**
 * Load customer-safe portal data for a customer id (used by both the token
 * portal and a logged-in customer's own portal). Only exposes progress +
 * billing summaries — never internal costs, staff notes, or parts pricing.
 */
export async function loadPortalDataByCustomer(customerId: string): Promise<PortalData | null> {
  const svc = createServiceClient()

  const [{ data: customer }, { data: jobs }, { data: invoices }] = await Promise.all([
    svc.from("customers").select("id, full_name, mobile").eq("id", customerId).maybeSingle(),
    svc
      .from("jobs")
      .select(
        "id, job_number, stage, created_at, updated_at, vehicle_make, vehicle_model, vehicle_year, plate_number, plate_emirate, plate_code",
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    svc
      .from("invoices")
      .select("id, invoice_number, status, total, amount_paid, created_at, job_id")
      .order("created_at", { ascending: false }),
  ])

  if (!customer) return null

  const jobIds = new Set((jobs ?? []).map((j) => j.id))

  const portalJobs: PortalJob[] = (jobs ?? []).map((j) => {
    const stage = (STAGE_ORDER.includes(j.stage as Stage) ? j.stage : "check_in") as Stage
    const veh = [j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ")
    const plate = [j.plate_emirate, j.plate_code, j.plate_number].filter(Boolean).join(" ") || null
    return {
      id: j.id,
      job_number: j.job_number,
      stage,
      stage_label: STAGE_MAP[stage]?.label ?? stage,
      vehicle_label: veh || "Vehicle",
      plate,
      created_at: j.created_at,
      updated_at: j.updated_at,
    }
  })

  const portalInvoices: PortalInvoice[] = (invoices ?? [])
    .filter((inv) => inv.job_id && jobIds.has(inv.job_id))
    .map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      created_at: inv.created_at,
    }))

  return {
    customer: { id: customer.id, full_name: customer.full_name, phone: customer.mobile },
    jobs: portalJobs,
    invoices: portalInvoices,
  }
}

/**
 * Best-effort audit of a tracking-link open. Atomically bumps open_count and
 * first/last opened timestamps via the record_tracking_open RPC. Never throws
 * into the render path — callers should still guard with .catch().
 */
export async function recordTrackingOpen(
  token: string,
  _meta?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  if (!token) return
  const svc = createServiceClient()
  await svc.rpc("record_tracking_open", { p_token: token })
}

export function portalStageProgress(stage: Stage): number {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0) return 0
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100)
}
