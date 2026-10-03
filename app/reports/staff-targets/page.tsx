import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { createServiceClient } from "@/lib/supabase/server"
import { StaffTargetsClient, type TargetRow } from "@/components/staff-targets-client"

export const metadata = { title: "Staff Targets · SHWURX Auto Service Center" }

function monthBounds(month: string | undefined) {
  const now = new Date()
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const [y, m] = valid ? month!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1]
  const pad = (n: number) => String(n).padStart(2, "0")
  const lastDay = new Date(y, m, 0).getDate()
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
  return { month: `${y}-${pad(m)}`, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay)}`, next }
}

type Acc = { total: number; count: number }

function add(map: Map<string, Acc>, id: string | null, amount: unknown) {
  if (!id) return
  const row = map.get(id) ?? { total: 0, count: 0 }
  row.total += Number(amount) || 0
  row.count += 1
  map.set(id, row)
}

export default async function StaffTargetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getShellUser()
  if (user.role !== "owner") redirect("/denied?from=Staff%20Targets")

  const { month, from, to, next } = monthBounds((await searchParams).month)
  const svc = createServiceClient()

  const [purchasesRes, salesRes, staffRes, targetsRes] = await Promise.all([
    svc
      .from("supplier_invoices")
      .select("created_by, total")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .or(`and(invoice_date.gte.${from},invoice_date.lte.${to}),and(invoice_date.is.null,created_at.gte.${from},created_at.lt.${next})`),
    svc
      .from("invoices")
      .select("total, jobs(advisor_id)")
      .neq("status", "cancelled")
      .gte("issue_date", from)
      .lte("issue_date", to),
    svc.from("profiles").select("id, full_name, role, job_title, is_active").neq("role", "customer"),
    svc.from("staff_targets").select("user_id, kind, monthly_target"),
  ])

  const purchases = new Map<string, Acc>()
  for (const r of purchasesRes.data ?? []) add(purchases, r.created_by, r.total)

  const sales = new Map<string, Acc>()
  for (const r of (salesRes.data ?? []) as unknown as { total: number | null; jobs: { advisor_id: string | null } | null }[]) {
    add(sales, r.jobs?.advisor_id ?? null, r.total)
  }

  const staff = (staffRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || "Unnamed",
    title: (p.job_title as string | null) || (p.role as string),
    active: p.is_active !== false,
  }))
  const staffById = new Map(staff.map((s) => [s.id, s]))

  const targets = { purchase: new Map<string, number>(), sales: new Map<string, number>() }
  for (const t of targetsRes.data ?? []) {
    targets[t.kind as "purchase" | "sales"]?.set(t.user_id, Number(t.monthly_target) || 0)
  }

  function rows(kind: "purchase" | "sales", totals: Map<string, Acc>): TargetRow[] {
    const ids = new Set([...totals.keys(), ...targets[kind].keys()])
    return [...ids]
      .map((id) => {
        const s = staffById.get(id)
        return {
          userId: id,
          name: s?.name ?? "Former staff",
          title: s?.title ?? "",
          total: totals.get(id)?.total ?? 0,
          count: totals.get(id)?.count ?? 0,
          target: targets[kind].get(id) ?? 0,
        }
      })
      .sort((a, b) => b.total - a.total)
  }

  return (
    <AppShell user={user}>
      <StaffTargetsClient
        month={month}
        purchasers={rows("purchase", purchases)}
        advisors={rows("sales", sales)}
        staff={staff.filter((s) => s.active).map(({ id, name }) => ({ id, name }))}
      />
    </AppShell>
  )
}
