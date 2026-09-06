import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * SHWURX AI Control Center — deterministic analysis engine.
 *
 * Every figure and finding here is computed directly from the live database.
 * Nothing is invented: each finding carries the real numbers behind it and,
 * where possible, a deep link to the exact record. The LLM layer (Ask SHWURX
 * AI) only phrases and answers questions over this snapshot — it never
 * originates findings or numbers.
 */

export type Severity = "critical" | "high" | "medium" | "low"
export type Category = "financial" | "operations" | "inventory" | "sales" | "data"

export type Finding = {
  id: string
  rule: string
  category: Category
  severity: Severity
  title: string
  detail: string
  amount: number | null
  href: string | null
  evidence: Record<string, unknown>
}

export type ScoreBreakdown = {
  overall: number
  categories: Record<Category, number>
}

export type MoneyLine = { id: string; label: string; amount: number; href: string | null; sub?: string }

export type MoneyOverview = {
  receivableTotal: number
  receivableCount: number
  receivableTop: MoneyLine[]
  payableTotal: number
  payableCount: number
  payableTop: MoneyLine[]
  cashIn7: number
  cashIn30: number
  netPosition: number
}

export type JobProfit = {
  id: string
  jobNumber: string
  label: string
  revenue: number
  partsCost: number
  margin: number
  marginPct: number | null
  href: string
}

export type Profitability = {
  invoicedJobs: number
  totalRevenue: number
  totalPartsCost: number
  estimatedGrossMargin: number
  avgMarginPct: number | null
  best: JobProfit[]
  worst: JobProfit[]
}

export type PipelineStage = { key: string; label: string; count: number }
export type Pipeline = {
  jobStages: PipelineStage[]
  openQuotationValue: number
  openQuotationCount: number
  pendingAppointments: number
  newLeads: number
}

export type Analysis = {
  generatedAt: string
  score: ScoreBreakdown
  headline: string
  findings: Finding[]
  priorities: Finding[]
  money: MoneyOverview
  profitability: Profitability
  pipeline: Pipeline
  counts: Record<string, number>
}

const N = (v: unknown): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number)
  return Number.isFinite(n) ? (n as number) : 0
}
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()
const daysSince = (iso: string | null | undefined): number =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000) : 0

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 14, high: 8, medium: 3, low: 1 }
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Runs the full business analysis. Uses the service-role client so the owner
 * sees the complete picture regardless of row-level scoping. Read-only.
 */
export async function runAnalysis(): Promise<Analysis> {
  const db = createServiceClient()

  const [
    jobsRes,
    invoicesRes,
    supplierInvoicesRes,
    paymentsRes,
    partsReqRes,
    inventoryRes,
    movementsRes,
    quotationsRes,
    approvalsRes,
    leadsRes,
    apptRes,
    customersRes,
  ] = await Promise.all([
    db.from("jobs").select("id, job_number, stage, approval_status, customer_name, vehicle_make, vehicle_model, plate_number, customer_id, vehicle_id, created_at, updated_at, estimated_completion"),
    db.from("invoices").select("id, invoice_number, job_id, customer_name, status, total, subtotal, amount_paid, issue_date, due_date, created_at"),
    db.from("supplier_invoices").select("id, doc_number, supplier_id, supplier_name_raw, invoice_number, total, amount_paid, payment_status, status, invoice_date, created_at, deleted_at").is("deleted_at", null),
    db.from("payments").select("id, direction, amount, paid_at").eq("direction", "in").gte("paid_at", daysAgo(30)),
    db.from("parts_requests").select("id, job_id, part_name, quantity, status, cost, created_at, updated_at").is("deleted_at", null),
    db.from("inventory_items").select("id, sku, name, quantity, reorder_level, cost_price, sale_price, updated_at").is("deleted_at", null),
    db.from("stock_movements").select("item_id, created_at").gte("created_at", daysAgo(90)),
    db.from("quotations").select("id, job_id, total, created_at"),
    db.from("approval_requests").select("id, job_id, kind, status, total, sent_at, expires_at, created_at").eq("kind", "quotation"),
    db.from("leads").select("id, name, status, source, created_at"),
    db.from("appointments").select("id, name, status, preferred_date, created_at"),
    db.from("customers").select("id, full_name, mobile"),
  ])

  const jobs = jobsRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const supplierInvoices = supplierInvoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const partsReq = partsReqRes.data ?? []
  const inventory = inventoryRes.data ?? []
  const movements = movementsRes.data ?? []
  const quotations = quotationsRes.data ?? []
  const approvals = approvalsRes.data ?? []
  const leads = leadsRes.data ?? []
  const appts = apptRes.data ?? []
  const customers = customersRes.data ?? []

  const findings: Finding[] = []
  const add = (f: Finding) => findings.push(f)

  // ---- Parts cost per job ----
  // parts_requests.cost is the line total for that request, so we sum it directly.
  const partsCostByJob = new Map<string, number>()
  for (const p of partsReq) {
    if (!p.job_id) continue
    partsCostByJob.set(p.job_id, (partsCostByJob.get(p.job_id) ?? 0) + N(p.cost))
  }

  // ===================== FINANCIAL =====================
  // Accounts receivable: invoices not fully paid.
  const receivables = invoices
    .map((i) => ({ ...i, outstanding: N(i.total) - N(i.amount_paid) }))
    .filter((i) => i.outstanding > 0.01)
    .sort((a, b) => b.outstanding - a.outstanding)
  const receivableTotal = receivables.reduce((t, i) => t + i.outstanding, 0)

  for (const i of receivables) {
    const overdueDays = i.due_date ? daysSince(i.due_date) : 0
    const isOverdue = overdueDays > 0
    add({
      id: `ar:${i.id}`,
      rule: "unpaid_invoice",
      category: "financial",
      severity: i.outstanding >= 5000 || overdueDays > 30 ? "high" : "medium",
      title: `Unpaid invoice ${i.invoice_number ?? ""}`.trim(),
      detail: `${i.customer_name ?? "Customer"} owes ${money(i.outstanding)} on invoice ${i.invoice_number ?? i.id.slice(0, 8)}${isOverdue ? ` — ${overdueDays} days overdue` : ""}.`,
      amount: i.outstanding,
      href: `/invoices/${i.id}`,
      evidence: { invoice_number: i.invoice_number, total: N(i.total), amount_paid: N(i.amount_paid), due_date: i.due_date, overdue_days: overdueDays },
    })
  }

  // Accounts payable: supplier invoices not fully paid.
  const payables = supplierInvoices
    .map((s) => ({ ...s, outstanding: N(s.total) - N(s.amount_paid) }))
    .filter((s) => s.outstanding > 0.01)
    .sort((a, b) => b.outstanding - a.outstanding)
  const payableTotal = payables.reduce((t, s) => t + s.outstanding, 0)

  for (const s of payables) {
    add({
      id: `ap:${s.id}`,
      rule: "unpaid_supplier_invoice",
      category: "financial",
      severity: s.outstanding >= 5000 ? "high" : "medium",
      title: `Payable to ${s.supplier_name_raw ?? "supplier"}`,
      detail: `You owe ${money(s.outstanding)} on supplier invoice ${s.invoice_number ?? s.doc_number ?? s.id.slice(0, 8)}.`,
      amount: s.outstanding,
      href: `/purchasing/invoices/${s.id}`,
      evidence: { invoice_number: s.invoice_number, total: N(s.total), amount_paid: N(s.amount_paid) },
    })
  }

  const cashIn30 = payments.reduce((t, p) => t + N(p.amount), 0)
  const cashIn7 = payments.filter((p) => p.paid_at && p.paid_at >= daysAgo(7)).reduce((t, p) => t + N(p.amount), 0)

  const money_: MoneyOverview = {
    receivableTotal,
    receivableCount: receivables.length,
    receivableTop: receivables.slice(0, 8).map((i) => ({ id: i.id, label: `${i.invoice_number ?? i.id.slice(0, 8)} · ${i.customer_name ?? ""}`.trim(), amount: i.outstanding, href: `/invoices/${i.id}` })),
    payableTotal,
    payableCount: payables.length,
    payableTop: payables.slice(0, 8).map((s) => ({ id: s.id, label: `${s.invoice_number ?? s.doc_number ?? s.id.slice(0, 8)} · ${s.supplier_name_raw ?? ""}`.trim(), amount: s.outstanding, href: `/purchasing/invoices/${s.id}` })),
    cashIn7,
    cashIn30,
    netPosition: receivableTotal - payableTotal,
  }

  // ===================== PROFITABILITY =====================
  const invoiceByJob = new Map<string, { subtotal: number; total: number }>()
  for (const i of invoices) {
    if (!i.job_id) continue
    const prev = invoiceByJob.get(i.job_id) ?? { subtotal: 0, total: 0 }
    invoiceByJob.set(i.job_id, { subtotal: prev.subtotal + N(i.subtotal), total: prev.total + N(i.total) })
  }
  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const jobProfits: JobProfit[] = []
  for (const [jobId, inv] of invoiceByJob) {
    const job = jobById.get(jobId)
    const revenue = inv.subtotal > 0 ? inv.subtotal : inv.total
    const partsCost = partsCostByJob.get(jobId) ?? 0
    const margin = revenue - partsCost
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : null
    const label = job ? `${job.job_number ?? ""} · ${[job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ")}`.trim() : jobId.slice(0, 8)
    jobProfits.push({ id: jobId, jobNumber: job?.job_number ?? jobId.slice(0, 8), label, revenue, partsCost, margin, marginPct, href: `/jobs/${jobId}` })
  }
  jobProfits.sort((a, b) => b.margin - a.margin)

  for (const jp of jobProfits) {
    if (jp.revenue <= 0) continue
    if (jp.margin < 0) {
      add({
        id: `margin:${jp.id}`,
        rule: "negative_margin_job",
        category: "financial",
        severity: "high",
        title: `Job ${jp.jobNumber} is losing money`,
        detail: `Parts cost ${money(jp.partsCost)} exceeds invoiced revenue ${money(jp.revenue)} — margin ${money(jp.margin)}. (Excludes labour wages.)`,
        amount: jp.margin,
        href: jp.href,
        evidence: { revenue: jp.revenue, partsCost: jp.partsCost, marginPct: jp.marginPct },
      })
    } else if (jp.marginPct !== null && jp.marginPct < 15) {
      add({
        id: `thinmargin:${jp.id}`,
        rule: "thin_margin_job",
        category: "financial",
        severity: "medium",
        title: `Thin margin on job ${jp.jobNumber}`,
        detail: `Estimated parts margin is only ${jp.marginPct.toFixed(1)}% (${money(jp.margin)} on ${money(jp.revenue)}).`,
        amount: jp.margin,
        href: jp.href,
        evidence: { revenue: jp.revenue, partsCost: jp.partsCost, marginPct: jp.marginPct },
      })
    }
  }

  const totalRevenue = jobProfits.reduce((t, j) => t + j.revenue, 0)
  const totalPartsCost = jobProfits.reduce((t, j) => t + j.partsCost, 0)
  const profitability: Profitability = {
    invoicedJobs: jobProfits.length,
    totalRevenue,
    totalPartsCost,
    estimatedGrossMargin: totalRevenue - totalPartsCost,
    avgMarginPct: totalRevenue > 0 ? ((totalRevenue - totalPartsCost) / totalRevenue) * 100 : null,
    best: jobProfits.slice(0, 5),
    worst: [...jobProfits].reverse().slice(0, 5),
  }

  // ===================== OPERATIONS =====================
  // Received parts on jobs that were never invoiced = cost incurred, not billed.
  const invoicedJobIds = new Set(invoices.map((i) => i.job_id).filter(Boolean) as string[])
  const unbilledByJob = new Map<string, number>()
  for (const p of partsReq) {
    if (p.status === "received" && p.job_id && !invoicedJobIds.has(p.job_id)) {
      unbilledByJob.set(p.job_id, (unbilledByJob.get(p.job_id) ?? 0) + N(p.cost))
    }
  }
  for (const [jobId, cost] of unbilledByJob) {
    if (cost <= 0) continue
    const job = jobById.get(jobId)
    add({
      id: `unbilled:${jobId}`,
      rule: "received_parts_unbilled",
      category: "operations",
      severity: cost >= 1000 ? "high" : "medium",
      title: `Parts received but job not invoiced`,
      detail: `Job ${job?.job_number ?? jobId.slice(0, 8)} has ${money(cost)} of received parts but no invoice yet — potential un-billed cost.`,
      amount: cost,
      href: `/jobs/${jobId}`,
      evidence: { parts_cost: cost, stage: job?.stage },
    })
  }

  // Stagnant work-in-progress.
  const wipStages = new Set(["check_in", "repair", "customer_approval"])
  for (const j of jobs) {
    if (!wipStages.has(j.stage as string)) continue
    const idle = daysSince(j.updated_at)
    if (idle >= 7) {
      add({
        id: `wip:${j.id}`,
        rule: "stagnant_wip",
        category: "operations",
        severity: idle >= 21 ? "high" : idle >= 14 ? "medium" : "low",
        title: `Job ${j.job_number ?? ""} stalled at ${labelStage(j.stage as string)}`,
        detail: `No update in ${idle} days. Vehicle: ${[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ") || "—"} (${j.plate_number ?? "no plate"}).`,
        amount: null,
        href: `/jobs/${j.id}`,
        evidence: { stage: j.stage, idle_days: idle, updated_at: j.updated_at },
      })
    }
  }

  // Overdue estimated completion.
  for (const j of jobs) {
    if (j.stage === "delivered" || !j.estimated_completion) continue
    const over = daysSince(j.estimated_completion)
    if (over > 0) {
      add({
        id: `eta:${j.id}`,
        rule: "overdue_completion",
        category: "operations",
        severity: over >= 5 ? "high" : "medium",
        title: `Job ${j.job_number ?? ""} past promised date`,
        detail: `Estimated completion was ${over} day(s) ago and the job is still at ${labelStage(j.stage as string)}.`,
        amount: null,
        href: `/jobs/${j.id}`,
        evidence: { estimated_completion: j.estimated_completion, stage: j.stage, days_over: over },
      })
    }
  }

  // Pending customer approvals aging.
  for (const a of approvals) {
    if (a.status !== "pending") continue
    const expired = a.expires_at ? daysSince(a.expires_at) > 0 : false
    const age = daysSince(a.sent_at ?? a.created_at)
    if (expired || age >= 3) {
      add({
        id: `approval:${a.id}`,
        rule: "aging_quotation_approval",
        category: "sales",
        severity: expired ? "high" : "medium",
        title: expired ? `Quotation approval expired` : `Quotation awaiting approval ${age}d`,
        detail: `${money(N(a.total))} quotation is ${expired ? "expired and " : ""}still unapproved${a.job_id ? "" : ""}.`,
        amount: N(a.total),
        href: a.job_id ? `/jobs/${a.job_id}` : `/jobs`,
        evidence: { total: N(a.total), sent_at: a.sent_at, expires_at: a.expires_at, age_days: age },
      })
    }
  }

  // ===================== INVENTORY =====================
  const movedItems = new Set(movements.map((m) => m.item_id))
  for (const it of inventory) {
    const qty = N(it.quantity)
    const reorder = N(it.reorder_level)
    if (reorder > 0 && qty <= reorder) {
      add({
        id: `lowstock:${it.id}`,
        rule: "low_stock",
        category: "inventory",
        severity: qty <= 0 ? "high" : "medium",
        title: qty <= 0 ? `Out of stock: ${it.name}` : `Low stock: ${it.name}`,
        detail: `${qty} on hand vs reorder level ${reorder}${it.sku ? ` (SKU ${it.sku})` : ""}.`,
        amount: null,
        href: `/inventory`,
        evidence: { quantity: qty, reorder_level: reorder, sku: it.sku },
      })
    }
    if (N(it.cost_price) > 0 && N(it.sale_price) > 0 && N(it.sale_price) < N(it.cost_price)) {
      add({
        id: `negprice:${it.id}`,
        rule: "sale_below_cost",
        category: "inventory",
        severity: "high",
        title: `${it.name} sells below cost`,
        detail: `Sale price ${money(N(it.sale_price))} is below cost ${money(N(it.cost_price))} — every sale loses money.`,
        amount: N(it.sale_price) - N(it.cost_price),
        href: `/inventory`,
        evidence: { cost_price: N(it.cost_price), sale_price: N(it.sale_price) },
      })
    }
    // Dead stock: value on the shelf with no movement in 90 days.
    if (qty > 0 && !movedItems.has(it.id) && daysSince(it.updated_at) >= 90) {
      const tied = qty * N(it.cost_price)
      if (tied >= 200) {
        add({
          id: `dead:${it.id}`,
          rule: "dead_stock",
          category: "inventory",
          severity: tied >= 2000 ? "medium" : "low",
          title: `Dead stock: ${it.name}`,
          detail: `${qty} units (${money(tied)} tied up) with no movement in 90+ days.`,
          amount: tied,
          href: `/inventory`,
          evidence: { quantity: qty, cost_price: N(it.cost_price), value: tied },
        })
      }
    }
  }

  // ===================== SALES PIPELINE =====================
  for (const l of leads) {
    const status = (l.status ?? "new") as string
    if ((status === "new" || l.status == null) && daysSince(l.created_at) >= 2) {
      add({
        id: `lead:${l.id}`,
        rule: "unactioned_lead",
        category: "sales",
        severity: daysSince(l.created_at) >= 5 ? "medium" : "low",
        title: `Lead not actioned`,
        detail: `${l.name ?? "A lead"} (${l.source ?? "web"}) has been sitting for ${daysSince(l.created_at)} days.`,
        amount: null,
        href: `/leads`,
        evidence: { source: l.source, age_days: daysSince(l.created_at) },
      })
    }
  }
  for (const a of appts) {
    if (a.status === "pending" && a.preferred_date && daysSince(a.preferred_date) > 0) {
      add({
        id: `appt:${a.id}`,
        rule: "missed_appointment",
        category: "sales",
        severity: "medium",
        title: `Appointment date passed, still pending`,
        detail: `${a.name ?? "Customer"} booked for ${a.preferred_date} is still unconfirmed.`,
        amount: null,
        href: `/appointments`,
        evidence: { preferred_date: a.preferred_date },
      })
    }
  }

  // ===================== DATA QUALITY =====================
  const jobsNoCustomer = jobs.filter((j) => !j.customer_id).length
  if (jobsNoCustomer > 0) {
    add({
      id: `data:jobs_no_customer`,
      rule: "jobs_missing_customer",
      category: "data",
      severity: "low",
      title: `${jobsNoCustomer} job(s) not linked to a customer`,
      detail: `Linking jobs to customer records improves history and reporting.`,
      amount: null,
      href: `/jobs`,
      evidence: { count: jobsNoCustomer },
    })
  }
  const custNoMobile = customers.filter((c) => !c.mobile).length
  if (custNoMobile > 0) {
    add({
      id: `data:cust_no_mobile`,
      rule: "customers_missing_mobile",
      category: "data",
      severity: "low",
      title: `${custNoMobile} customer(s) missing a mobile number`,
      detail: `No mobile means no SMS/WhatsApp follow-up or reminders.`,
      amount: null,
      href: `/customers`,
      evidence: { count: custNoMobile },
    })
  }
  const invNoCost = inventory.filter((it) => N(it.quantity) > 0 && N(it.cost_price) <= 0).length
  if (invNoCost > 0) {
    add({
      id: `data:inv_no_cost`,
      rule: "inventory_missing_cost",
      category: "data",
      severity: "medium",
      title: `${invNoCost} stocked item(s) have no cost price`,
      detail: `Without a cost price, margin and profitability figures for these parts are understated.`,
      amount: null,
      href: `/inventory`,
      evidence: { count: invNoCost },
    })
  }

  // ===================== SCORING =====================
  const score = computeScore(findings)

  // Priorities: worst-first, money-weighted.
  const priorities = [...findings]
    .sort((a, b) => {
      if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      return (b.amount ?? 0) - (a.amount ?? 0)
    })
    .slice(0, 8)

  const pipeline: Pipeline = {
    jobStages: countStages(jobs),
    openQuotationValue: approvals.filter((a) => a.status === "pending").reduce((t, a) => t + N(a.total), 0),
    openQuotationCount: approvals.filter((a) => a.status === "pending").length,
    pendingAppointments: appts.filter((a) => a.status === "pending").length,
    newLeads: leads.filter((l) => l.status == null || l.status === "new").length,
  }

  const headline = buildHeadline(score, money_, findings)

  return {
    generatedAt: new Date().toISOString(),
    score,
    headline,
    findings,
    priorities,
    money: money_,
    profitability,
    pipeline,
    counts: {
      jobs: jobs.length,
      openJobs: jobs.filter((j) => j.stage !== "delivered").length,
      invoices: invoices.length,
      inventoryItems: inventory.length,
      customers: customers.length,
      findings: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
    },
  }
}

function computeScore(findings: Finding[]): ScoreBreakdown {
  const cats: Category[] = ["financial", "operations", "inventory", "sales", "data"]
  const penalty = (list: Finding[]) => list.reduce((t, f) => t + SEVERITY_WEIGHT[f.severity], 0)
  const toScore = (p: number) => Math.max(0, Math.min(100, Math.round(100 - p)))
  const categories = {} as Record<Category, number>
  for (const c of cats) categories[c] = toScore(penalty(findings.filter((f) => f.category === c)))
  // Overall is weighted toward money and operations.
  const weights: Record<Category, number> = { financial: 0.32, operations: 0.26, inventory: 0.16, sales: 0.16, data: 0.1 }
  const overall = Math.round(cats.reduce((t, c) => t + categories[c] * weights[c], 0))
  return { overall, categories }
}

function countStages(jobs: { stage: string | null }[]): PipelineStage[] {
  const order = ["check_in", "repair", "customer_approval", "delivered"]
  const counts = new Map<string, number>()
  for (const j of jobs) counts.set(j.stage ?? "unknown", (counts.get(j.stage ?? "unknown") ?? 0) + 1)
  return order.filter((s) => counts.has(s)).map((s) => ({ key: s, label: labelStage(s), count: counts.get(s) ?? 0 }))
}

function labelStage(s: string): string {
  return ({ check_in: "Check-in", repair: "In Repair", customer_approval: "Awaiting Approval", delivered: "Delivered" } as Record<string, string>)[s] ?? s
}

function buildHeadline(score: ScoreBreakdown, m: MoneyOverview, findings: Finding[]): string {
  const crit = findings.filter((f) => f.severity === "critical" || f.severity === "high").length
  const state = score.overall >= 80 ? "healthy" : score.overall >= 60 ? "stable with some gaps" : score.overall >= 40 ? "under pressure" : "needs urgent attention"
  return `Business health is ${state} (${score.overall}/100). ${m.receivableTotal > 0 ? `${money(m.receivableTotal)} is owed to you across ${m.receivableCount} invoice(s). ` : ""}${crit > 0 ? `${crit} high-priority issue(s) need action.` : "No high-priority issues right now."}`
}

function money(n: number): string {
  return `AED ${Math.round(n).toLocaleString("en-AE")}`
}
