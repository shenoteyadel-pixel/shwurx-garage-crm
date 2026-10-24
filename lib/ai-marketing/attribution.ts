import type { SupabaseClient } from "@supabase/supabase-js"
import type { AttributionChannel, AttributionReport } from "@/lib/ai-marketing/types"
import { ACQUISITION_LEAD_SOURCES, isExcludedAcquisitionLead, resolvePaidLeadAttribution } from "./lead-attribution"

/**
 * Ad campaign → Lead → Advisor → Appointment → Job Card → Invoice → Payment.
 * Read-only: uses existing CRM rows and never modifies leads, webhooks or assignments.
 * A lead only counts towards revenue when it is linked to a customer record,
 * so revenue is never guessed from name/phone similarity.
 */
type Lead = { id: string; name: string | null; source: string; customer_id: string | null; created_at: string; metadata: Record<string, unknown> | null }

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export async function computeAttribution(
  supabase: SupabaseClient,
  spend: { meta: number | null; google: number | null },
  days = 30,
): Promise<AttributionReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const notes: string[] = []

  const { data: leadRows, error } = await supabase
    .from("leads")
    .select("id, name, source, customer_id, created_at, metadata")
    .in("source", [...ACQUISITION_LEAD_SOURCES])
    .gte("created_at", since)
  if (error) throw new Error(`Could not read leads: ${error.message}`)

  const leads = ((leadRows ?? []) as Lead[]).filter((l) => {
    return !isExcludedAcquisitionLead(l) && resolvePaidLeadAttribution(l.source, l.metadata) !== null
  })
  const customerIds = [...new Set(leads.map((l) => l.customer_id).filter((v): v is string => Boolean(v)))]

  const [apptRes, jobRes] = customerIds.length
    ? await Promise.all([
        supabase.from("appointments").select("customer_id, created_at").in("customer_id", customerIds).gte("created_at", since),
        supabase
          .from("jobs")
          .select("id, customer_id, created_at")
          .in("customer_id", customerIds)
          .is("deleted_at", null)
          .gte("created_at", since),
      ])
    : [{ data: [] }, { data: [] }]
  const appts = (apptRes.data ?? []) as { customer_id: string; created_at: string }[]
  const jobs = (jobRes.data ?? []) as { id: string; customer_id: string; created_at: string }[]

  const jobIds = jobs.map((j) => j.id)
  const { data: invRows } = jobIds.length
    ? await supabase.from("invoices").select("job_id, amount_paid, status").in("job_id", jobIds).neq("status", "void")
    : { data: [] }
  const paidByJob = new Map<string, number>()
  for (const inv of (invRows ?? []) as { job_id: string; amount_paid: number | null }[]) {
    paidByJob.set(inv.job_id, (paidByJob.get(inv.job_id) ?? 0) + Number(inv.amount_paid ?? 0))
  }

  // First paid-ad lead per customer owns that customer's downstream activity.
  const firstLead = new Map<string, Lead>()
  for (const l of [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (l.customer_id && !firstLead.has(l.customer_id)) firstLead.set(l.customer_id, l)
  }

  const campaignKey = (l: Lead) => resolvePaidLeadAttribution(l.source, l.metadata)?.campaign ?? "Unknown campaign"
  const campaigns = new Map<string, { channel: "meta" | "google"; campaign: string; leads: number; customers: number; revenue: number }>()
  const advisors = new Map<string, { name: string; leads: number; customers: number }>()
  const ch: Record<"meta" | "google", Omit<AttributionChannel, "spend" | "costPerLead" | "costPerAppointment" | "costPerCustomer" | "roas" | "leadToCustomerRate">> = {
    meta: { channel: "meta", leads: 0, linkedLeads: 0, appointments: 0, jobs: 0, customers: 0, revenue: 0 },
    google: { channel: "google", leads: 0, linkedLeads: 0, appointments: 0, jobs: 0, customers: 0, revenue: 0 },
  }

  for (const l of leads) {
    const c = resolvePaidLeadAttribution(l.source, l.metadata)!.channel
    ch[c].leads++
    if (l.customer_id) ch[c].linkedLeads++
    const key = `${c}:${campaignKey(l)}`
    const camp = campaigns.get(key) ?? { channel: c, campaign: campaignKey(l), leads: 0, customers: 0, revenue: 0 }
    camp.leads++
    campaigns.set(key, camp)
    const advisor = typeof l.metadata?.assigned_name === "string" ? l.metadata.assigned_name : null
    if (advisor) {
      const a = advisors.get(advisor) ?? { name: advisor, leads: 0, customers: 0 }
      a.leads++
      advisors.set(advisor, a)
    }
  }

  for (const [customerId, lead] of firstLead) {
    const c = resolvePaidLeadAttribution(lead.source, lead.metadata)!.channel
    const custAppts = appts.filter((a) => a.customer_id === customerId && a.created_at >= lead.created_at)
    const custJobs = jobs.filter((j) => j.customer_id === customerId && j.created_at >= lead.created_at)
    const revenue = custJobs.reduce((n, j) => n + (paidByJob.get(j.id) ?? 0), 0)
    ch[c].appointments += custAppts.length
    ch[c].jobs += custJobs.length
    if (revenue > 0) {
      ch[c].customers++
      ch[c].revenue += revenue
      const camp = campaigns.get(`${c}:${campaignKey(lead)}`)
      if (camp) {
        camp.customers++
        camp.revenue += revenue
      }
      const advisor = typeof lead.metadata?.assigned_name === "string" ? lead.metadata.assigned_name : null
      if (advisor) advisors.get(advisor)!.customers++
    }
  }

  const unlinked = leads.filter((l) => !l.customer_id).length
  if (unlinked) notes.push(`${unlinked} paid-ad lead(s) are not linked to a customer record, so their revenue cannot be attributed.`)
  if (spend.meta === null) notes.push("Meta spend unavailable — cost and ROAS for Meta need a connected Marketing API.")
  if (spend.google === null) notes.push("Google Ads spend unavailable — cost and ROAS for Google need a connected Google Ads API.")
  notes.push("Revenue = amount actually paid on invoices of job cards opened after the customer's first paid-ad lead.")

  const channels: AttributionChannel[] = (["meta", "google"] as const).map((c) => {
    const base = ch[c]
    const s = spend[c]
    return {
      ...base,
      spend: s,
      costPerLead: s === null ? null : ratio(s, base.leads),
      costPerAppointment: s === null ? null : ratio(s, base.appointments),
      costPerCustomer: s === null ? null : ratio(s, base.customers),
      roas: s === null ? null : ratio(base.revenue, s),
      leadToCustomerRate: ratio(base.customers, base.leads),
    }
  })

  return {
    days,
    channels,
    campaigns: [...campaigns.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads).slice(0, 20),
    advisors: [...advisors.values()].sort((a, b) => b.customers - a.customers || b.leads - a.leads),
    notes,
  }
}
