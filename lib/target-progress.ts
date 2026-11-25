import type { SupabaseClient } from "@supabase/supabase-js"
import { departmentCommission, targetCommission, type TargetKind, type TargetLine } from "@/lib/salary-statement"
import { classifyLabour } from "@/lib/labour-report"

type Acc = { total: number; count: number }

export type ComebackDeductions = Record<"sales" | "technician", Map<string, Acc>>

/**
 * A comeback opened in [from, next) cuts the invoiced value of the original job from whoever is responsible:
 * advisor → sales target, technician → technician target, both or not decided → both. Customer/parts faults cut nothing.
 */
export async function loadComebackDeductions(svc: SupabaseClient, from: string, next: string): Promise<ComebackDeductions> {
  const deductions: ComebackDeductions = { sales: new Map(), technician: new Map() }
  const { data } = await svc
    .from("jobs")
    .select("comeback_of, comeback_advisor_id, comeback_technician_id, comeback_responsibility")
    .not("comeback_of", "is", null)
    .gte("created_at", from)
    .lt("created_at", next)
  const comebacks = (data ?? []) as {
    comeback_of: string
    comeback_advisor_id: string | null
    comeback_technician_id: string | null
    comeback_responsibility: string | null
  }[]
  if (!comebacks.length) return deductions

  const originalIds = [...new Set(comebacks.map((c) => c.comeback_of))]
  const { data: originals } = await svc
    .from("jobs")
    .select("id, advisor_id, technician_id, invoices(total, status)")
    .in("id", originalIds)
  const byId = new Map(
    ((originals ?? []) as unknown as {
      id: string
      advisor_id: string | null
      technician_id: string | null
      invoices: { total: number | null; status: string | null }[] | null
    }[]).map((o) => [o.id, o]),
  )
  const deduct = (kind: "sales" | "technician", id: string | null, amount: number) => {
    if (!id || amount <= 0) return
    const acc = deductions[kind].get(id) ?? { total: 0, count: 0 }
    acc.total += amount
    acc.count += 1
    deductions[kind].set(id, acc)
  }
  for (const c of comebacks) {
    const resp = c.comeback_responsibility ?? "none"
    if (resp === "customer" || resp === "parts") continue
    const o = byId.get(c.comeback_of)
    const value = (o?.invoices ?? [])
      .filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + (Number(i.total) || 0), 0)
    if (resp === "advisor" || resp === "both" || resp === "none")
      deduct("sales", c.comeback_advisor_id ?? o?.advisor_id ?? null, value)
    if (resp === "technician" || resp === "both" || resp === "none")
      deduct("technician", c.comeback_technician_id ?? o?.technician_id ?? null, value)
  }
  return deductions
}

/** Approved/completed upsell value per job, used to keep upsells out of the advisor sales target. */
export async function loadUpsellByJob(svc: SupabaseClient, jobIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const ids = [...new Set(jobIds)]
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await svc
      .from("addon_sales")
      .select("job_id, net_amount")
      .in("status", ["approved", "completed"])
      .in("job_id", ids.slice(i, i + 200))
    for (const r of data ?? []) out.set(r.job_id, (out.get(r.job_id) ?? 0) + (Number(r.net_amount) || 0))
  }
  return out
}

export type SectionWork = { programming: number; electrical: number; count: number }

/** Invoiced electrical + programming labour (excl. VAT) in [from, to], skipping cancelled invoices and comebacks. */
export async function loadSectionWork(svc: SupabaseClient, from: string, to: string): Promise<SectionWork> {
  const { data } = await svc
    .from("invoice_items")
    .select("description, line_total, invoices!inner(issue_date, status, jobs(comeback_of))")
    .eq("kind", "labour")
    .neq("invoices.status", "cancelled")
    .gte("invoices.issue_date", from)
    .lte("invoices.issue_date", to)
    .range(0, 9999)
  const work: SectionWork = { programming: 0, electrical: 0, count: 0 }
  for (const r of (data ?? []) as unknown as {
    description: string | null
    line_total: number | null
    invoices: { jobs: { comeback_of: string | null } | null } | null
  }[]) {
    if (r.invoices?.jobs?.comeback_of) continue
    const dept = classifyLabour(null, r.description)
    if (dept !== "programming" && dept !== "electrical") continue
    work[dept] += Number(r.line_total) || 0
    work.count += 1
  }
  work.programming = Math.round(work.programming * 100) / 100
  work.electrical = Math.round(work.electrical * 100) / 100
  return work
}

export type MasterWork = {
  /** Workshop labour (excl. VAT, excl. electrical/programming) on invoices in the month, before comeback cuts. */
  labour: number
  count: number
  comebackCut: number
  comebacks: number
  /** Labour on jobs the master technician worked on himself (already part of `labour`). */
  own: Map<string, { labour: number; count: number }>
}

const isWorkshopLabour = (description: string | null) => {
  const dept = classifyLabour(null, description)
  return dept !== "programming" && dept !== "electrical"
}

/**
 * Team labour a master technician is measured on: all workshop labour invoiced in [from, to] (comeback jobs skipped),
 * minus the labour of original jobs that came back in [from, next) where the workshop was at fault (technician, both or undecided).
 */
export async function loadMasterWork(
  svc: SupabaseClient,
  from: string,
  to: string,
  next: string,
  masterIds: string[],
): Promise<MasterWork> {
  const work: MasterWork = { labour: 0, count: 0, comebackCut: 0, comebacks: 0, own: new Map() }
  const { data } = await svc
    .from("invoice_items")
    .select("description, line_total, invoices!inner(job_id, issue_date, status, jobs(comeback_of, technician_id))")
    .eq("kind", "labour")
    .neq("invoices.status", "cancelled")
    .gte("invoices.issue_date", from)
    .lte("invoices.issue_date", to)
    .range(0, 9999)
  const byJob = new Map<string, { labour: number; technicianId: string | null }>()
  for (const r of (data ?? []) as unknown as {
    description: string | null
    line_total: number | null
    invoices: { job_id: string | null; jobs: { comeback_of: string | null; technician_id: string | null } | null } | null
  }[]) {
    const jobId = r.invoices?.job_id
    if (!jobId || r.invoices?.jobs?.comeback_of || !isWorkshopLabour(r.description)) continue
    const job = byJob.get(jobId) ?? { labour: 0, technicianId: r.invoices?.jobs?.technician_id ?? null }
    job.labour += Number(r.line_total) || 0
    byJob.set(jobId, job)
  }
  for (const j of byJob.values()) work.labour += j.labour
  work.count = byJob.size

  if (masterIds.length && byJob.size) {
    const jobIds = [...byJob.keys()]
    const worked = new Map<string, Set<string>>()
    const mark = (masterId: string, jobId: string) => {
      const set = worked.get(masterId) ?? new Set<string>()
      set.add(jobId)
      worked.set(masterId, set)
    }
    for (const [jobId, j] of byJob) if (j.technicianId && masterIds.includes(j.technicianId)) mark(j.technicianId, jobId)
    for (let i = 0; i < jobIds.length; i += 200) {
      const { data: tasks } = await svc
        .from("technician_tasks")
        .select("job_id, technician_id")
        .in("technician_id", masterIds)
        .in("job_id", jobIds.slice(i, i + 200))
      for (const t of tasks ?? []) if (t.technician_id && t.job_id) mark(t.technician_id, t.job_id)
    }
    for (const [masterId, set] of worked) {
      let labour = 0
      for (const jobId of set) labour += byJob.get(jobId)?.labour ?? 0
      work.own.set(masterId, { labour: Math.round(labour * 100) / 100, count: set.size })
    }
  }

  const { data: comebackRows } = await svc
    .from("jobs")
    .select("comeback_of, comeback_responsibility")
    .not("comeback_of", "is", null)
    .gte("created_at", from)
    .lt("created_at", next)
  const faulty = (comebackRows ?? []).filter((c) => !["customer", "parts", "advisor"].includes(c.comeback_responsibility ?? "none"))
  if (faulty.length) {
    const originalIds = [...new Set(faulty.map((c) => c.comeback_of as string))]
    const { data: items } = await svc
      .from("invoice_items")
      .select("description, line_total, invoices!inner(job_id, status)")
      .eq("kind", "labour")
      .neq("invoices.status", "cancelled")
      .in("invoices.job_id", originalIds)
    const labourByOriginal = new Map<string, number>()
    for (const r of (items ?? []) as unknown as { description: string | null; line_total: number | null; invoices: { job_id: string } | null }[]) {
      if (!r.invoices?.job_id || !isWorkshopLabour(r.description)) continue
      labourByOriginal.set(r.invoices.job_id, (labourByOriginal.get(r.invoices.job_id) ?? 0) + (Number(r.line_total) || 0))
    }
    for (const c of faulty) {
      const value = labourByOriginal.get(c.comeback_of as string) ?? 0
      if (value <= 0) continue
      work.comebackCut += value
      work.comebacks += 1
    }
  }

  work.labour = Math.round(work.labour * 100) / 100
  work.comebackCut = Math.round(work.comebackCut * 100) / 100
  return work
}

/** Monthly target, achievement and commission per employee. Pass userId to limit the result to one person. */
export async function loadTargetProgress(
  svc: SupabaseClient,
  month: string,
  userId?: string,
): Promise<Map<string, TargetLine[]>> {
  const [y, mo] = month.split("-").map(Number)
  const from = `${month}-01`
  const to = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`

  let targetsQ = svc.from("staff_targets").select("user_id, kind, monthly_target, commission_percent").or("monthly_target.gt.0,kind.eq.department")
  if (userId) targetsQ = targetsQ.eq("user_id", userId)
  const { data: targetRows } = await targetsQ
  const result = new Map<string, TargetLine[]>()
  if (!targetRows?.length) return result

  let purchasesQ = svc
    .from("supplier_invoices")
    .select("created_by, total")
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .or(`and(invoice_date.gte.${from},invoice_date.lte.${to}),and(invoice_date.is.null,created_at.gte.${from},created_at.lt.${next})`)
  if (userId) purchasesQ = purchasesQ.eq("created_by", userId)

  let salesQ = svc
    .from("invoices")
    .select("job_id, total, jobs!inner(advisor_id, technician_id, comeback_of)")
    .neq("status", "cancelled")
    .gte("issue_date", from)
    .lte("issue_date", to)
  if (userId) salesQ = salesQ.or(`advisor_id.eq.${userId},technician_id.eq.${userId}`, { referencedTable: "jobs" })

  const [purchasesRes, salesRes, deductions] = await Promise.all([
    purchasesQ,
    salesQ,
    loadComebackDeductions(svc, from, next),
  ])

  const section = targetRows.some((t) => t.kind === "department") ? await loadSectionWork(svc, from, to) : null
  const masterIds = targetRows.filter((t) => t.kind === "master").map((t) => t.user_id as string)
  const master = masterIds.length ? await loadMasterWork(svc, from, to, next, masterIds) : null

  const totals: Record<TargetKind, Map<string, Acc>> = {
    purchase: new Map(),
    sales: new Map(),
    technician: new Map(),
    department: new Map(),
    master: new Map(),
  }
  const add = (kind: TargetKind, id: string | null | undefined, amount: unknown) => {
    if (!id) return
    const acc = totals[kind].get(id) ?? { total: 0, count: 0 }
    acc.total += Number(amount) || 0
    acc.count += 1
    totals[kind].set(id, acc)
  }
  for (const r of purchasesRes.data ?? []) add("purchase", r.created_by as string, r.total)
  const salesRows = (salesRes.data ?? []) as unknown as {
    job_id: string | null
    total: number | null
    jobs: { advisor_id: string | null; technician_id: string | null; comeback_of: string | null } | null
  }[]
  // Upsell (add-on) lines are paid through their own commission, so they are
  // removed from the advisor's normal sales target only. Company revenue and the
  // technician target still include them.
  const upsellLeft = await loadUpsellByJob(svc, salesRows.map((r) => r.job_id).filter(Boolean) as string[])
  for (const r of salesRows) {
    if (r.jobs?.comeback_of) continue
    const total = Number(r.total) || 0
    const left = r.job_id ? (upsellLeft.get(r.job_id) ?? 0) : 0
    const cut = Math.min(left, total)
    if (r.job_id && cut) upsellLeft.set(r.job_id, left - cut)
    add("sales", r.jobs?.advisor_id, total - cut)
    add("technician", r.jobs?.technician_id, total)
  }

  for (const t of targetRows) {
    const kind = t.kind as TargetKind
    const target = Number(t.monthly_target) || 0
    const percent = Number(t.commission_percent) || 0
    if (kind === "department") {
      const achieved = Math.round(((section?.programming ?? 0) + (section?.electrical ?? 0)) * 100) / 100
      const list = result.get(t.user_id as string) ?? []
      list.push({
        kind,
        target,
        achieved,
        gross: achieved,
        count: section?.count ?? 0,
        percent,
        commission: departmentCommission(section?.programming ?? 0, percent),
        commissionBase: section?.programming ?? 0,
      })
      result.set(t.user_id as string, list)
      continue
    }
    if (kind === "master") {
      const gross = master?.labour ?? 0
      const cut = master?.comebackCut ?? 0
      const net = Math.max(0, gross - cut)
      const own = master?.own.get(t.user_id as string)
      const list = result.get(t.user_id as string) ?? []
      list.push({
        kind,
        target,
        achieved: Math.round(net * 100) / 100,
        gross,
        count: master?.count ?? 0,
        percent,
        commission: targetCommission(target, net, percent),
        comebackDeduction: cut,
        comebacks: master?.comebacks ?? 0,
        ownWork: own?.labour ?? 0,
        ownCount: own?.count ?? 0,
      })
      result.set(t.user_id as string, list)
      continue
    }
    const acc = totals[kind]?.get(t.user_id as string) ?? { total: 0, count: 0 }
    const cut = kind === "purchase" ? { total: 0, count: 0 } : (deductions[kind].get(t.user_id as string) ?? { total: 0, count: 0 })
    const net = Math.max(0, acc.total - cut.total)
    const line: TargetLine = {
      kind,
      target,
      achieved: Math.round(net * 100) / 100,
      count: acc.count,
      percent,
      commission: targetCommission(target, net, percent),
      gross: Math.round(acc.total * 100) / 100,
      comebackDeduction: Math.round(cut.total * 100) / 100,
      comebacks: cut.count,
    }
    const list = result.get(t.user_id as string) ?? []
    list.push(line)
    result.set(t.user_id as string, list)
  }
  return result
}
