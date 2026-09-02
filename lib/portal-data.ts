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

/**
 * Resolve a portal token to customer-safe data using the service client.
 * Returns null if the token is missing, revoked, or expired. Touches
 * last_used_at for auditing. Only exposes progress + billing summaries —
 * never internal costs, staff notes, technician assignments, or parts pricing.
 */
export async function resolvePortalToken(token: string): Promise<PortalData | null> {
  if (!token) return null
  const svc = createServiceClient()

  const { data: row } = await svc
    .from("customer_portal_tokens")
    .select("customer_id, expires_at, revoked")
    .eq("token", token)
    .maybeSingle()

  if (!row || row.revoked) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  const customerId = row.customer_id as string

  // void the token's freshness marker (best-effort)
  await svc.from("customer_portal_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token)

  return loadPortalDataByCustomer(customerId)
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

export function portalStageProgress(stage: Stage): number {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0) return 0
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100)
}
