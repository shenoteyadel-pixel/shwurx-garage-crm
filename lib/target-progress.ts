import type { SupabaseClient } from "@supabase/supabase-js"
import { targetCommission, type TargetKind, type TargetLine } from "@/lib/salary-statement"

type Acc = { total: number; count: number }

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
    .select("total, jobs!inner(advisor_id, technician_id)")
    .neq("status", "cancelled")
    .gte("issue_date", from)
    .lte("issue_date", to)
  if (userId) salesQ = salesQ.or(`advisor_id.eq.${userId},technician_id.eq.${userId}`, { referencedTable: "jobs" })

  const [purchasesRes, salesRes] = await Promise.all([purchasesQ, salesQ])

  const totals: Record<TargetKind, Map<string, Acc>> = { purchase: new Map(), sales: new Map(), technician: new Map() }
  const add = (kind: TargetKind, id: string | null | undefined, amount: unknown) => {
    if (!id) return
    const acc = totals[kind].get(id) ?? { total: 0, count: 0 }
    acc.total += Number(amount) || 0
    acc.count += 1
    totals[kind].set(id, acc)
  }
  for (const r of purchasesRes.data ?? []) add("purchase", r.created_by as string, r.total)
  for (const r of (salesRes.data ?? []) as unknown as {
    total: number | null
    jobs: { advisor_id: string | null; technician_id: string | null } | null
  }[]) {
    add("sales", r.jobs?.advisor_id, r.total)
    add("technician", r.jobs?.technician_id, r.total)
  }

  for (const t of targetRows) {
    const kind = t.kind as TargetKind
    const target = Number(t.monthly_target) || 0
    const percent = Number(t.commission_percent) || 0
    const acc = totals[kind]?.get(t.user_id as string) ?? { total: 0, count: 0 }
    const line: TargetLine = {
      kind,
      target,
      achieved: Math.round(acc.total * 100) / 100,
      count: acc.count,
      percent,
      commission: targetCommission(target, acc.total, percent),
    }
    const list = result.get(t.user_id as string) ?? []
    list.push(line)
    result.set(t.user_id as string, list)
  }
  return result
}
