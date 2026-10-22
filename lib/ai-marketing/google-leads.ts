import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Read-only Google Ads lead → CRM funnel built from existing records:
 * leads (Google lead forms + website enquiries carrying a GCLID / utm_source=google),
 * appointments, job cards, quotations and invoices. Nothing is written.
 */
export interface GoogleLeadRow {
  id: string
  createdAt: string
  name: string | null
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  gclid: string | null
  vehicle: string | null
  service: string | null
  advisor: string | null
  leadStatus: string
  appointmentStatus: string | null
  quotationStatus: string | null
  jobStatus: string | null
  invoiceTotal: number | null
  invoicePaid: number | null
  converted: boolean
  duplicateOf: string | null
}

type Lead = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string
  status: string
  service_interest: string | null
  customer_id: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const pick = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), o)
const phoneKey = (p: string | null) => (p ? p.replace(/\D/g, "").slice(-9) : null)

export function leadGclid(meta: Record<string, unknown> | null): string | null {
  return (
    str(meta?.gclid) ??
    str(pick(meta, "click_ids", "gclid")) ??
    str(pick(meta, "attribution", "click_ids", "gclid")) ??
    str(pick(meta, "attribution", "gclid"))
  )
}

function isGoogleLead(l: Lead) {
  if (l.source === "google_ads") return true
  const m = l.metadata
  if (leadGclid(m)) return true
  const utm = str(m?.utm_source) ?? str(pick(m, "attribution", "utm_source")) ?? str(pick(m, "utm", "source"))
  return utm?.toLowerCase() === "google" && (str(m?.utm_medium) ?? str(pick(m, "attribution", "utm_medium")) ?? "").match(/cpc|ppc|paid/i) !== null
}

export async function getGoogleLeadFunnel(supabase: SupabaseClient, days = 90): Promise<GoogleLeadRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, email, source, status, service_interest, customer_id, created_at, metadata")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000)
  if (error) throw new Error(`Could not read leads: ${error.message}`)

  const leads = ((data ?? []) as Lead[]).filter((l) => !l.metadata?.deleted_at && isGoogleLead(l))
  if (!leads.length) return []

  const customerIds = [...new Set(leads.map((l) => l.customer_id).filter((v): v is string => Boolean(v)))]
  const phones = [...new Set(leads.map((l) => l.phone).filter((v): v is string => Boolean(v)))]

  const [apptRes, jobRes, vehRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("customer_id, phone, status, vehicle_make, vehicle_model, service_interest, created_at")
      .or(
        [customerIds.length && `customer_id.in.(${customerIds.join(",")})`, phones.length && `phone.in.(${phones.map((p) => `"${p}"`).join(",")})`]
          .filter(Boolean)
          .join(",") || "id.is.null",
      )
      .gte("created_at", since),
    customerIds.length
      ? supabase
          .from("jobs")
          .select("id, customer_id, stage, approval_status, vehicle_make, vehicle_model, advisor_id, created_at")
          .in("customer_id", customerIds)
          .is("deleted_at", null)
          .gte("created_at", since)
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? supabase.from("vehicles").select("customer_id, make, model").in("customer_id", customerIds)
      : Promise.resolve({ data: [] }),
  ])
  type Appt = { customer_id: string | null; phone: string | null; status: string; vehicle_make: string | null; vehicle_model: string | null; service_interest: string | null; created_at: string }
  type Job = { id: string; customer_id: string; stage: string; approval_status: string | null; vehicle_make: string | null; vehicle_model: string | null; advisor_id: string | null; created_at: string }
  const appts = (apptRes.data ?? []) as Appt[]
  const jobs = (jobRes.data ?? []) as Job[]
  const vehicles = (vehRes.data ?? []) as { customer_id: string; make: string | null; model: string | null }[]

  const jobIds = jobs.map((j) => j.id)
  const advisorIds = [...new Set(jobs.map((j) => j.advisor_id).filter((v): v is string => Boolean(v)))]
  const [quoteRes, invRes, profRes] = await Promise.all([
    jobIds.length ? supabase.from("quotations").select("job_id, total").in("job_id", jobIds) : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from("invoices").select("job_id, total, amount_paid, status").in("job_id", jobIds).neq("status", "void")
      : Promise.resolve({ data: [] }),
    advisorIds.length ? supabase.from("profiles").select("id, full_name").in("id", advisorIds) : Promise.resolve({ data: [] }),
  ])
  const quotedJobs = new Set(((quoteRes.data ?? []) as { job_id: string }[]).map((q) => q.job_id))
  const invoices = (invRes.data ?? []) as { job_id: string; total: number | null; amount_paid: number | null }[]
  const advisorName = new Map(((profRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]))

  // Oldest lead per phone owns the record; later ones are flagged as duplicates.
  const firstByPhone = new Map<string, string>()
  for (const l of [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const k = phoneKey(l.phone)
    if (k && !firstByPhone.has(k)) firstByPhone.set(k, l.id)
  }

  return leads.map((l) => {
    const pk = phoneKey(l.phone)
    const appt = appts
      .filter((a) => (l.customer_id && a.customer_id === l.customer_id) || (pk && phoneKey(a.phone) === pk))
      .filter((a) => a.created_at >= l.created_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const job = l.customer_id
      ? jobs.filter((j) => j.customer_id === l.customer_id && j.created_at >= l.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      : undefined
    const jobInvoices = job ? invoices.filter((i) => i.job_id === job.id) : []
    const invoiceTotal = jobInvoices.length ? jobInvoices.reduce((n, i) => n + Number(i.total ?? 0), 0) : null
    const invoicePaid = jobInvoices.length ? jobInvoices.reduce((n, i) => n + Number(i.amount_paid ?? 0), 0) : null
    const veh = l.customer_id ? vehicles.find((v) => v.customer_id === l.customer_id) : undefined
    const vehicle =
      [job?.vehicle_make ?? appt?.vehicle_make ?? veh?.make, job?.vehicle_model ?? appt?.vehicle_model ?? veh?.model].filter(Boolean).join(" ") ||
      str(l.metadata?.vehicle) ||
      null
    const first = pk ? firstByPhone.get(pk) : undefined
    return {
      id: l.id,
      createdAt: l.created_at,
      name: l.name,
      phone: l.phone,
      email: l.email,
      source: l.source,
      campaign: str(l.metadata?.campaign) ?? str(pick(l.metadata, "attribution", "utm_campaign")) ?? null,
      gclid: leadGclid(l.metadata),
      vehicle,
      service: l.service_interest ?? appt?.service_interest ?? null,
      advisor: str(l.metadata?.assigned_name) ?? (job?.advisor_id ? (advisorName.get(job.advisor_id) ?? null) : null),
      leadStatus: l.status,
      appointmentStatus: appt?.status ?? null,
      quotationStatus: job ? (quotedJobs.has(job.id) ? (job.approval_status ?? "quoted") : "not_quoted") : null,
      jobStatus: job?.stage ?? null,
      invoiceTotal,
      invoicePaid,
      converted: (invoicePaid ?? 0) > 0,
      duplicateOf: first && first !== l.id ? first : null,
    }
  })
}
