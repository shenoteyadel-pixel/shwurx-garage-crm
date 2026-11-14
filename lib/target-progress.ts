import type { SupabaseClient } from "@supabase/supabase-js"
import { targetCommission, type TargetKind, type TargetLine } from "@/lib/salary-statement"

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

  let targetsQ = svc.from("staff_targets").select("user_id, kind, monthly_target, commission_percent").gt("monthly_target", 0)
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

  const totals: Record<TargetKind, Map<string, Acc>> = { purchase: new Map(), sales: new Map(), technician: new Map() }
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
