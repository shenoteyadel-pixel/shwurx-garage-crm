import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyUser, notifyByPermission } from "@/lib/actions-notifications"
import { DEFAULT_CHECKLIST, DONE_STATUSES } from "@/lib/technician-tasks"
import {
  COMMISSION_STATUS_LABEL,
  RECOMMENDATION_ORDER,
  computeLine,
  recommend,
  type Recommendation,
  deriveCommission,
  type AddonSaleStatus,
  type CommissionResult,
  type InvoiceState,
  type LineFigures,
  type PartialPolicy,
} from "@/lib/addon-commission"

export type AddonSaleRow = {
  id: string
  job_id: string
  catalog_id: string
  advisor_id: string | null
  status: AddonSaleStatus
  name: string
  category: string
  kind: string
  quantity: number
  unit_price: number
  unit_cost: number
  unit_extra_cost: number
  original_amount: number
  discount: number
  net_amount: number
  commission_pct: number
  commission_eligible: boolean
  rate_override_reason: string | null
  recommendation: string
  notes: string | null
  evidence_url: string | null
  approval_request_id: string | null
  item_key: string | null
  technician_task_id: string | null
  parts_request_id: string | null
  approved_at: string | null
  decided_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  last_commission_status: string | null
  created_at: string
}

export type PayoutRow = {
  id: string
  sale_id: string
  advisor_id: string
  amount: number
  paid_at: string
  method: string | null
  reference: string | null
  reversed_at: string | null
  reverse_reason: string | null
}

export type LedgerRow = AddonSaleRow & {
  job_number: string | null
  advisor_name: string | null
  line: LineFigures
  commission: CommissionResult
  invoice: (NonNullable<InvoiceState> & { number?: string | null }) | null
  payout: PayoutRow | null
}

export function lineOf(s: AddonSaleRow): LineFigures {
  const directCost = Math.round(Number(s.quantity) * (Number(s.unit_cost) + Number(s.unit_extra_cost)) * 100) / 100
  const net = Number(s.net_amount)
  const gp = Math.round((net - directCost) * 100) / 100
  return {
    originalAmount: Number(s.original_amount),
    discount: Number(s.discount),
    netAmount: net,
    directCost,
    grossProfit: gp,
    marginPct: net > 0 ? Math.round((gp / net) * 10000) / 100 : 0,
    commission: s.commission_eligible && gp > 0 ? Math.round(gp * Number(s.commission_pct)) / 100 : 0,
  }
}

export async function getAddonPolicy(svc: SupabaseClient): Promise<{ policy: PartialPolicy; discountAlertPct: number }> {
  const { data } = await svc
    .from("settings")
    .select("addon_partial_payment_policy, addon_discount_alert_pct")
    .eq("id", 1)
    .maybeSingle()
  return {
    policy: (data?.addon_partial_payment_policy as PartialPolicy) ?? "proportional",
    discountAlertPct: Number(data?.addon_discount_alert_pct ?? 20),
  }
}

/** Picks the job's live customer invoice; falls back to a cancelled one so reversals show. */
async function invoicesByJob(svc: SupabaseClient, jobIds: string[]) {
  const map = new Map<string, InvoiceState & { number?: string | null }>()
  if (!jobIds.length) return map
  const { data } = await svc
    .from("invoices")
    .select("job_id, invoice_number, status, total, amount_paid, created_at")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
  for (const inv of data ?? []) {
    const current = map.get(inv.job_id)
    const candidate = {
      status: inv.status,
      total: Number(inv.total) || 0,
      amountPaid: Number(inv.amount_paid) || 0,
      number: inv.invoice_number,
    }
    if (!current || (current.status === "cancelled" && inv.status !== "cancelled")) map.set(inv.job_id, candidate)
  }
  return map
}

async function techStatus(svc: SupabaseClient, taskIds: string[]) {
  const map = new Map<string, string>()
  if (!taskIds.length) return map
  const { data } = await svc.from("technician_tasks").select("id, status").in("id", taskIds)
  for (const t of data ?? []) map.set(t.id, t.status)
  return map
}

async function onApproved(svc: SupabaseClient, sale: AddonSaleRow, job: any) {
  const patch: Record<string, unknown> = {}
  if (job?.technician_id && !sale.technician_task_id) {
    const { data: task } = await svc
      .from("technician_tasks")
      .insert({
        job_id: sale.job_id,
        technician_id: job.technician_id,
        title: `Add-on: ${sale.name}${Number(sale.quantity) > 1 ? ` × ${sale.quantity}` : ""}`,
        description: [sale.notes, "Customer-approved add-on. Mark repair completed when done."].filter(Boolean).join("\n"),
        status: "assigned",
        checklist: DEFAULT_CHECKLIST,
        created_by: sale.advisor_id,
      })
      .select("id")
      .single()
    if (task) patch.technician_task_id = task.id
  }
  if (sale.kind === "product" && !sale.parts_request_id) {
    const { data: pr } = await svc
      .from("parts_requests")
      .insert({
        job_id: sale.job_id,
        part_name: sale.name,
        quantity: sale.quantity,
        status: "required",
        notes: "Customer-approved add-on sale",
        requested_by: sale.advisor_id,
      })
      .select("id")
      .single()
    if (pr) patch.parts_request_id = pr.id
  }
  if (Object.keys(patch).length) await svc.from("addon_sales").update(patch).eq("id", sale.id)

  const jobNo = job?.job_number ?? sale.job_id.slice(0, 8)
  const link = `/jobs/${sale.job_id}`
  if (sale.advisor_id) {
    await notifyUser(sale.advisor_id, {
      title: "Add-on approved",
      body: `${sale.name} on job ${jobNo} was approved by the customer.`,
      type: "addon",
      link,
    })
  }
  await notifyByPermission("jobs.assign", {
    title: "Approved add-on to schedule",
    body: `${sale.name} on job ${jobNo} is approved${patch.technician_task_id ? " and assigned to the job technician" : ". Assign a technician"}.`,
    type: "addon",
    link,
  })
}

async function maybeNotifyTarget(svc: SupabaseClient, advisorId: string) {
  const { data: target } = await svc
    .from("staff_targets")
    .select("monthly_target")
    .eq("user_id", advisorId)
    .eq("kind", "addon")
    .maybeSingle()
  const goal = Number(target?.monthly_target ?? 0)
  if (goal <= 0) return
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: sales } = await svc
    .from("addon_sales")
    .select("net_amount")
    .eq("advisor_id", advisorId)
    .in("status", ["approved", "completed"])
    .gte("approved_at", monthStart.toISOString())
  const total = (sales ?? []).reduce((s, r) => s + Number(r.net_amount), 0)
  if (total < goal) return
  const { count } = await svc
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", advisorId)
    .eq("title", "Add-on target reached")
    .gte("created_at", monthStart.toISOString())
  if (count) return
  await notifyUser(advisorId, {
    title: "Add-on target reached",
    body: `You've sold AED ${total.toFixed(2)} of add-ons this month against a target of AED ${goal.toFixed(2)}.`,
    type: "addon",
    link: "/my-addon-sales",
  })
}

/**
 * Brings add-on lines for the given jobs up to date: applies customer decisions,
 * marks work completed when the linked technician task is done, and notifies the
 * advisor whenever the commission status moves. Safe to call repeatedly.
 */
export async function syncAddonSales(jobIds: string[]): Promise<void> {
  if (!jobIds.length) return
  const svc = createServiceClient()
  const { data: rows } = await svc
    .from("addon_sales")
    .select("*")
    .in("job_id", jobIds)
    .in("status", ["proposed", "approved", "completed"])
  const sales = (rows ?? []) as AddonSaleRow[]
  if (!sales.length) return

  const { data: jobs } = await svc.from("jobs").select("id, job_number, technician_id, stage").in("id", jobIds)
  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]))

  const reqIds = [...new Set(sales.filter((s) => s.status === "proposed" && s.approval_request_id).map((s) => s.approval_request_id!))]
  const decisions = new Map<string, { decision: string; at: string }>()
  const reqStatus = new Map<string, string>()
  if (reqIds.length) {
    const [{ data: ds }, { data: rs }] = await Promise.all([
      svc.from("approval_item_decisions").select("approval_request_id, item_key, decision, created_at").in("approval_request_id", reqIds),
      svc.from("approval_requests").select("id, status").in("id", reqIds),
    ])
    for (const d of ds ?? []) decisions.set(`${d.approval_request_id}:${d.item_key}`, { decision: d.decision, at: d.created_at })
    for (const r of rs ?? []) reqStatus.set(r.id, r.status)
  }

  const now = new Date().toISOString()
  const approvedAdvisors = new Set<string>()
  for (const s of sales) {
    if (s.status !== "proposed" || !s.item_key) continue
    const d = decisions.get(s.item_key)
    const rs = s.approval_request_id ? reqStatus.get(s.approval_request_id) : undefined
    const rejected = d?.decision === "rejected" || (!d && (rs === "rejected" || rs === "expired" || rs === "superseded"))
    if (d?.decision === "approved") {
      const { data: updated } = await svc
        .from("addon_sales")
        .update({ status: "approved", approved_at: d.at, decided_at: d.at, updated_at: now })
        .eq("id", s.id)
        .eq("status", "proposed")
        .select("id")
      if (updated?.length) {
        s.status = "approved"
        s.approved_at = d.at
        await onApproved(svc, s, jobMap.get(s.job_id))
        if (s.advisor_id) approvedAdvisors.add(s.advisor_id)
      }
    } else if (rejected) {
      const { data: updated } = await svc
        .from("addon_sales")
        .update({ status: "rejected", decided_at: d?.at ?? now, updated_at: now })
        .eq("id", s.id)
        .eq("status", "proposed")
        .select("id")
      if (updated?.length) {
        s.status = "rejected"
        if (s.advisor_id) {
          await notifyUser(s.advisor_id, {
            title: "Add-on declined",
            body: `The customer declined ${s.name} on job ${jobMap.get(s.job_id)?.job_number ?? ""}.`,
            type: "addon",
            link: `/jobs/${s.job_id}`,
          })
        }
      }
    }
  }
  for (const a of approvedAdvisors) await maybeNotifyTarget(svc, a)

  const tasks = await techStatus(svc, sales.filter((s) => s.status === "approved" && s.technician_task_id).map((s) => s.technician_task_id!))
  for (const s of sales) {
    if (s.status !== "approved") continue
    const taskDone = s.technician_task_id && DONE_STATUSES.includes(tasks.get(s.technician_task_id) as any)
    const delivered = jobMap.get(s.job_id)?.stage === "delivered"
    if (!taskDone && !delivered) continue
    await svc.from("addon_sales").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", s.id).eq("status", "approved")
    s.status = "completed"
  }

  await refreshCommissionStatuses(svc, sales.filter((s) => s.status === "approved" || s.status === "completed"), jobMap)
}

async function refreshCommissionStatuses(svc: SupabaseClient, sales: AddonSaleRow[], jobMap: Map<string, any>) {
  if (!sales.length) return
  const { policy } = await getAddonPolicy(svc)
  const invoices = await invoicesByJob(svc, [...new Set(sales.map((s) => s.job_id))])
  const { data: payouts } = await svc
    .from("addon_commission_payouts")
    .select("sale_id")
    .in("sale_id", sales.map((s) => s.id))
    .is("reversed_at", null)
  const paid = new Set((payouts ?? []).map((p) => p.sale_id))

  for (const s of sales) {
    const r = deriveCommission({
      saleStatus: s.status,
      line: lineOf(s),
      invoice: invoices.get(s.job_id) ?? null,
      hasLivePayout: paid.has(s.id),
      policy,
    })
    if (r.status === s.last_commission_status) continue
    await svc.from("addon_sales").update({ last_commission_status: r.status }).eq("id", s.id)
    if (!s.advisor_id || !s.last_commission_status) continue
    const jobNo = jobMap.get(s.job_id)?.job_number ?? ""
    const message: Partial<Record<string, string>> = {
      work_completed: `${s.name} on job ${jobNo} is completed. Commission becomes earned once the invoice is paid.`,
      invoiced: `${s.name} on job ${jobNo} has been invoiced.`,
      earned: `Commission of AED ${r.earned.toFixed(2)} on ${s.name} (job ${jobNo}) is now earned.`,
      reversed: `Commission on ${s.name} (job ${jobNo}) was reversed.`,
    }
    const body = message[r.status]
    if (body) {
      await notifyUser(s.advisor_id, {
        title: `Add-on commission: ${COMMISSION_STATUS_LABEL[r.status]}`,
        body,
        type: "addon",
        link: "/my-addon-sales",
      })
    }
  }
}

/** Every sale line with its derived commission. Read-only; call syncAddonSales first for fresh status. */
export async function loadLedger(filter: {
  advisorId?: string
  from?: string
  to?: string
  jobId?: string
  includeDrafts?: boolean
}): Promise<LedgerRow[]> {
  const svc = createServiceClient()
  let q = svc.from("addon_sales").select("*").order("created_at", { ascending: false }).limit(2000)
  if (!filter.includeDrafts) q = q.neq("status", "draft")
  if (filter.advisorId) q = q.eq("advisor_id", filter.advisorId)
  if (filter.jobId) q = q.eq("job_id", filter.jobId)
  if (filter.from) q = q.gte("created_at", filter.from)
  if (filter.to) q = q.lt("created_at", filter.to)
  const { data } = await q
  const sales = (data ?? []) as AddonSaleRow[]
  if (!sales.length) return []

  const jobIds = [...new Set(sales.map((s) => s.job_id))]
  const advisorIds = [...new Set(sales.map((s) => s.advisor_id).filter(Boolean) as string[])]
  const [{ policy }, invoices, { data: jobs }, { data: profiles }, { data: payouts }] = await Promise.all([
    getAddonPolicy(svc),
    invoicesByJob(svc, jobIds),
    svc.from("jobs").select("id, job_number").in("id", jobIds),
    advisorIds.length ? svc.from("profiles").select("id, full_name").in("id", advisorIds) : Promise.resolve({ data: [] as any[] }),
    svc.from("addon_commission_payouts").select("*").in("sale_id", sales.map((s) => s.id)).is("reversed_at", null),
  ])
  const jobNo = new Map((jobs ?? []).map((j) => [j.id, j.job_number]))
  const names = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))
  const payoutBySale = new Map((payouts ?? []).map((p: any) => [p.sale_id, p as PayoutRow]))

  return sales.map((s) => {
    const line = lineOf(s)
    const invoice = invoices.get(s.job_id) ?? null
    const payout = payoutBySale.get(s.id) ?? null
    return {
      ...s,
      job_number: jobNo.get(s.job_id) ?? null,
      advisor_name: s.advisor_id ? (names.get(s.advisor_id) ?? null) : null,
      line,
      invoice,
      payout,
      commission: deriveCommission({ saleStatus: s.status, line, invoice, hasLivePayout: !!payout, policy }),
    }
  })
}

export type PanelCatalogItem = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  kind: string
  selling_price: number
  unit_cost: number
  commission_pct: number
  commission_eligible: boolean
  est_commission: number
  stock: number | null
  recommendation: Recommendation
}

/** Everything the job's Additional Sales tab needs, after syncing decisions. */
export async function loadJobAddonPanel(job: {
  id: string
  mileage: number | null
  vehicle_make: string | null
  vehicle_id: string | null
  complaint: string | null
}) {
  await syncAddonSales([job.id])
  const svc = createServiceClient()
  const [{ data: items }, lines, { data: tasks }] = await Promise.all([
    svc.from("addon_catalog").select("*").eq("active", true).order("category").order("name"),
    loadLedger({ jobId: job.id, includeDrafts: true }),
    svc.from("technician_tasks").select("title, description").eq("job_id", job.id),
  ])
  const catalog = items ?? []

  const stockIds = catalog.map((c) => c.inventory_item_id).filter(Boolean) as string[]
  const stock = new Map<string, number>()
  if (stockIds.length) {
    const { data: inv } = await svc.from("inventory_items").select("id, quantity").in("id", stockIds).is("deleted_at", null)
    for (const i of inv ?? []) stock.set(i.id, Number(i.quantity) || 0)
  }

  const history = new Map<string, { mileage: number | null; date: string }>()
  if (job.vehicle_id) {
    const { data: prevJobs } = await svc.from("jobs").select("id, mileage").eq("vehicle_id", job.vehicle_id).neq("id", job.id)
    const mileageByJob = new Map((prevJobs ?? []).map((j) => [j.id, j.mileage]))
    if (mileageByJob.size) {
      const { data: done } = await svc
        .from("addon_sales")
        .select("catalog_id, job_id, completed_at")
        .eq("status", "completed")
        .in("job_id", [...mileageByJob.keys()])
        .order("completed_at", { ascending: false })
      for (const d of done ?? []) {
        if (!history.has(d.catalog_id)) history.set(d.catalog_id, { mileage: mileageByJob.get(d.job_id) ?? null, date: d.completed_at })
      }
    }
  }

  const inspectionText = [job.complaint, ...(tasks ?? []).flatMap((t) => [t.title, t.description])].filter(Boolean).join(" ")
  const panelCatalog: PanelCatalogItem[] = catalog
    .map((c) => {
      const line = computeLine({
        quantity: 1,
        unitPrice: c.selling_price,
        unitCost: c.purchase_cost,
        unitExtraCost: c.extra_cost,
        discount: 0,
        commissionPct: c.commission_pct,
        commissionEligible: c.commission_eligible,
      })
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        category: c.category,
        kind: c.kind,
        selling_price: Number(c.selling_price),
        unit_cost: line.directCost,
        commission_pct: Number(c.commission_pct),
        commission_eligible: c.commission_eligible,
        est_commission: line.commission,
        stock: c.inventory_item_id ? (stock.get(c.inventory_item_id) ?? 0) : null,
        recommendation: recommend({
          mileage: job.mileage,
          jobMake: job.vehicle_make,
          compatibleMakes: c.compatible_makes,
          intervalKm: c.interval_km,
          intervalMonths: c.interval_months,
          last: history.get(c.id) ?? null,
          inspectionText,
          name: c.name,
        }),
      }
    })
    .sort((a, b) => RECOMMENDATION_ORDER[a.recommendation.level] - RECOMMENDATION_ORDER[b.recommendation.level])

  return { catalog: panelCatalog, lines }
}

/** Jobs that still have add-on lines moving through the lifecycle. */
export async function openAddonJobIds(advisorId?: string): Promise<string[]> {
  const svc = createServiceClient()
  let q = svc
    .from("addon_sales")
    .select("job_id")
    .or("status.in.(proposed,approved),and(status.eq.completed,last_commission_status.neq.paid)")
    .limit(500)
  if (advisorId) q = q.eq("advisor_id", advisorId)
  const { data } = await q
  return [...new Set((data ?? []).map((r) => r.job_id))]
}
