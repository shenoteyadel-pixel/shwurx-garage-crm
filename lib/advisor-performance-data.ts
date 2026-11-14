import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { loadUpsellByJob } from "@/lib/target-progress"
import {
  attributeCollections,
  normalizeBuckets,
  type AttributionRow,
  type InvoiceInput,
  type PartBuckets,
  type PaymentInput,
  type TargetCategory,
} from "@/lib/advisor-performance"

const CHUNK = 200
type Svc = ReturnType<typeof createServiceClient>

async function inChunks<T>(ids: string[], load: (slice: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += CHUNK) out.push(...(await load(unique.slice(i, i + CHUNK))))
  return out
}

export async function loadPerformanceSettings(svc: Svc = createServiceClient()) {
  const { data } = await svc.from("settings").select("google_review_url, part_source_buckets").eq("id", 1).maybeSingle()
  return {
    googleReviewUrl: (data?.google_review_url as string | null) ?? null,
    buckets: normalizeBuckets(data?.part_source_buckets),
  }
}

export interface PerformanceRow extends AttributionRow {
  invoice_number: string | null
  customer_name: string | null
}

export interface UnclassifiedLine {
  id: string
  invoice_id: string
  invoice_number: string | null
  description: string
  line_total: number
}

/**
 * Collected, ex-VAT category value per payment in [from, toExclusive), attributed to the
 * job's service advisor. Earlier payments on the same invoices are loaded too so refunds
 * and overpayments are clamped against the full payment history.
 */
export async function loadCollections(opts: {
  from: string
  toExclusive: string
  advisorId?: string
  buckets?: PartBuckets
}): Promise<{ rows: PerformanceRow[]; unclassified: UnclassifiedLine[] }> {
  const svc = createServiceClient()
  const buckets = opts.buckets ?? (await loadPerformanceSettings(svc)).buckets

  const { data: inRange } = await svc
    .from("payments")
    .select("invoice_id")
    .not("invoice_id", "is", null)
    .gte("paid_at", opts.from)
    .lt("paid_at", opts.toExclusive)
  const invoiceIds = [...new Set((inRange ?? []).map((p) => p.invoice_id as string))]
  if (!invoiceIds.length) return { rows: [], unclassified: [] }

  const invoices = await inChunks(invoiceIds, async (ids) => {
    const { data } = await svc
      .from("invoices")
      .select("id, invoice_number, job_id, customer_name, status, total, discount")
      .in("id", ids)
    return data ?? []
  })
  const jobIds = invoices.map((i) => i.job_id).filter(Boolean) as string[]
  const [jobs, items, payments, upsell] = await Promise.all([
    inChunks(jobIds, async (ids) => {
      const { data } = await svc.from("jobs").select("id, advisor_id").in("id", ids)
      return data ?? []
    }),
    inChunks(invoiceIds, async (ids) => {
      const { data } = await svc
        .from("invoice_items")
        .select("id, invoice_id, kind, description, line_total, billing_type, part_source")
        .in("invoice_id", ids)
      return data ?? []
    }),
    inChunks(invoiceIds, async (ids) => {
      const { data } = await svc
        .from("payments")
        .select("id, invoice_id, direction, amount, paid_at")
        .in("invoice_id", ids)
        .lt("paid_at", opts.toExclusive)
      return data ?? []
    }),
    loadUpsellByJob(svc, jobIds),
  ])

  const advisorByJob = new Map(jobs.map((j) => [j.id, j.advisor_id as string | null]))
  const itemsByInvoice = new Map<string, typeof items>()
  for (const it of items) {
    const list = itemsByInvoice.get(it.invoice_id) ?? []
    list.push(it)
    itemsByInvoice.set(it.invoice_id, list)
  }

  const inputs: InvoiceInput[] = invoices
    .map((inv) => ({
      id: inv.id,
      job_id: inv.job_id,
      advisor_id: inv.job_id ? (advisorByJob.get(inv.job_id) ?? null) : null,
      status: inv.status,
      total: Number(inv.total) || 0,
      discount: Number(inv.discount) || 0,
      upsell: inv.job_id ? (upsell.get(inv.job_id) ?? 0) : 0,
      items: (itemsByInvoice.get(inv.id) ?? []).map((it) => ({
        kind: it.kind,
        line_total: Number(it.line_total) || 0,
        billing_type: it.billing_type,
        part_source: it.part_source,
      })),
    }))
    .filter((i) => !opts.advisorId || i.advisor_id === opts.advisorId)

  const meta = new Map(invoices.map((i) => [i.id, i]))
  const rows = attributeCollections(inputs, payments as PaymentInput[], buckets)
    .filter((r) => r.day >= opts.from.slice(0, 10) && r.day < opts.toExclusive.slice(0, 10))
    .map((r) => ({
      ...r,
      invoice_number: meta.get(r.invoice_id)?.invoice_number ?? null,
      customer_name: meta.get(r.invoice_id)?.customer_name ?? null,
    }))

  const kept = new Set(inputs.filter((i) => i.status !== "cancelled").map((i) => i.id))
  const unclassified = items
    .filter((it) => kept.has(it.invoice_id) && it.kind === "part" && !it.part_source && Number(it.line_total) > 0)
    .map((it) => ({
      id: it.id,
      invoice_id: it.invoice_id,
      invoice_number: meta.get(it.invoice_id)?.invoice_number ?? null,
      description: it.description ?? "Part",
      line_total: Number(it.line_total) || 0,
    }))

  return { rows, unclassified }
}

export interface AdvisorTargetRow {
  id: string
  scope: "individual" | "team"
  user_id: string | null
  category: TargetCategory | "addon"
  month: string
  target: number
  commission_percent: number
  bonus_amount: number
  note: string | null
  created_at: string
  created_by: string | null
  superseded_at: string | null
}

/** Targets whose month falls in [fromMonth, toMonth]. Pass history to include superseded versions. */
export async function loadTargets(opts: { fromMonth: string; toMonth: string; userId?: string; history?: boolean }) {
  const svc = createServiceClient()
  let q = svc
    .from("advisor_targets")
    .select("id, scope, user_id, category, month, target, commission_percent, bonus_amount, note, created_at, created_by, superseded_at")
    .gte("month", opts.fromMonth)
    .lte("month", opts.toMonth)
    .order("created_at", { ascending: false })
  if (!opts.history) q = q.is("superseded_at", null)
  if (opts.userId) q = q.or(`user_id.eq.${opts.userId},scope.eq.team`)
  const { data } = await q
  return (data ?? []).map((t) => ({
    ...t,
    target: Number(t.target) || 0,
    commission_percent: Number(t.commission_percent) || 0,
    bonus_amount: Number(t.bonus_amount) || 0,
  })) as AdvisorTargetRow[]
}

export interface ReviewRequestRow {
  id: string
  job_id: string | null
  advisor_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  channel: string
  status: string
  sent_at: string
  verified_at: string | null
  verification_evidence: string | null
}

export async function loadReviewRequests(opts: { from: string; toExclusive: string; advisorId?: string }) {
  const svc = createServiceClient()
  let q = svc
    .from("review_requests")
    .select("id, job_id, advisor_id, customer_name, customer_mobile, channel, status, sent_at, verified_at, verification_evidence")
    .gte("sent_at", opts.from)
    .lt("sent_at", opts.toExclusive)
    .order("sent_at", { ascending: false })
  if (opts.advisorId) q = q.eq("advisor_id", opts.advisorId)
  const { data } = await q
  return (data ?? []) as ReviewRequestRow[]
}

export interface ReviewCandidate {
  job_id: string
  job_number: string | null
  advisor_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  requested: boolean
}

/** Every paid job in the period, so requests go to all customers rather than a chosen few. */
export async function loadReviewCandidates(rows: PerformanceRow[]): Promise<ReviewCandidate[]> {
  const paidJobs = new Map<string, number>()
  for (const r of rows) {
    if (!r.job_id) continue
    const v = r.amounts.labour + r.amounts.new_parts + r.amounts.used_parts
    paidJobs.set(r.job_id, (paidJobs.get(r.job_id) ?? 0) + v)
  }
  const ids = [...paidJobs].filter(([, v]) => v > 0).map(([id]) => id)
  if (!ids.length) return []
  const svc = createServiceClient()
  const [jobs, requests] = await Promise.all([
    inChunks(ids, async (s) => {
      const { data } = await svc
        .from("jobs")
        .select("id, job_number, advisor_id, customer_name, customer_mobile")
        .in("id", s)
      return data ?? []
    }),
    inChunks(ids, async (s) => {
      const { data } = await svc.from("review_requests").select("job_id").in("job_id", s)
      return data ?? []
    }),
  ])
  const requested = new Set(requests.map((r) => r.job_id))
  return jobs.map((j) => ({
    job_id: j.id,
    job_number: j.job_number,
    advisor_id: j.advisor_id,
    customer_name: j.customer_name,
    customer_mobile: j.customer_mobile,
    requested: requested.has(j.id),
  }))
}

export interface ApprovalRow {
  user_id: string
  month: string
  category: TargetCategory
  qualified_amount: number
  amount: number
  approved_at: string
}

export async function loadApprovals(opts: { fromMonth: string; toMonth: string; userId?: string }) {
  const svc = createServiceClient()
  let q = svc
    .from("advisor_commission_approvals")
    .select("user_id, month, category, qualified_amount, amount, approved_at")
    .gte("month", opts.fromMonth)
    .lte("month", opts.toMonth)
  if (opts.userId) q = q.eq("user_id", opts.userId)
  const { data } = await q
  return (data ?? []).map((a) => ({
    ...a,
    qualified_amount: Number(a.qualified_amount) || 0,
    amount: Number(a.amount) || 0,
  })) as ApprovalRow[]
}

export async function loadAdvisors() {
  const svc = createServiceClient()
  const { data } = await svc
    .from("profiles")
    .select("id, full_name")
    .eq("role", "service_advisor")
    .eq("is_active", true)
    .order("full_name")
  return (data ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string | null) ?? "Advisor" }))
}

export async function loadPerformanceAudit(limit = 60) {
  const svc = createServiceClient()
  const { data } = await svc
    .from("audit_logs")
    .select("id, actor_name, action, resource_type, detail, created_at")
    .in("resource_type", ["advisor_target", "advisor_commission", "review_request", "performance_settings", "invoice_item"])
    .order("created_at", { ascending: false })
    .limit(limit)
  return (data ?? []) as {
    id: string
    actor_name: string | null
    action: string
    resource_type: string
    detail: Record<string, unknown> | null
    created_at: string
  }[]
}
