import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import type { PayoutHistoryRow } from "@/components/addon-ledger-sections"

/** Commission payments (including reversed ones) dated inside [from, to]. */
export async function loadPayoutHistory(opts: { from: string; to: string; advisorId?: string }): Promise<PayoutHistoryRow[]> {
  const svc = createServiceClient()
  let q = svc
    .from("addon_commission_payouts")
    .select("id, sale_id, advisor_id, amount, paid_at, reference, reversed_at, reverse_reason")
    .gte("paid_at", opts.from)
    .lte("paid_at", opts.to)
    .order("paid_at", { ascending: false })
    .limit(1000)
  if (opts.advisorId) q = q.eq("advisor_id", opts.advisorId)
  const { data: payouts } = await q
  const list = payouts ?? []
  if (!list.length) return []

  const { data: sales } = await svc.from("addon_sales").select("id, job_id, name").in("id", [...new Set(list.map((p) => p.sale_id))])
  const saleById = new Map((sales ?? []).map((s) => [s.id, s]))
  const jobIds = [...new Set((sales ?? []).map((s) => s.job_id))]
  const [{ data: jobs }, { data: people }] = await Promise.all([
    jobIds.length ? svc.from("jobs").select("id, job_number").in("id", jobIds) : Promise.resolve({ data: [] as { id: string; job_number: string | null }[] }),
    svc.from("profiles").select("id, full_name").in("id", [...new Set(list.map((p) => p.advisor_id))]),
  ])
  const jobNo = new Map((jobs ?? []).map((j) => [j.id, j.job_number]))
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Advisor"]))

  return list.map((p) => {
    const sale = saleById.get(p.sale_id)
    return {
      id: p.id,
      advisor_name: nameOf.get(p.advisor_id) ?? "Advisor",
      job_number: sale ? (jobNo.get(sale.job_id) ?? null) : null,
      item_name: sale?.name ?? "Add-on",
      amount: Number(p.amount) || 0,
      paid_at: p.paid_at,
      reference: p.reference,
      reversed_at: p.reversed_at,
      reverse_reason: p.reverse_reason,
    }
  })
}
