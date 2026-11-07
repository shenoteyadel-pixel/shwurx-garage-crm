import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { MyPayView, type MyTarget, type MyPayslip } from "@/components/my-pay-view"
import { statementFor, type SalaryStaff } from "@/lib/salary-statement"
import {
  RECORD_COLUMNS,
  basisDaysFor,
  buildSummaries,
  loadAttendanceSettings,
  localDate,
  monthRange,
  shiftMinutes,
  type AttendanceRecord,
} from "@/lib/attendance"
import type { TargetKind } from "@/lib/actions-targets"

export const metadata = { title: "My Pay & Target · SHWURX Auto Service Center" }

const monthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export default async function MyPayPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const shellUser = await getShellUser()
  const ctx = await getSessionContext()
  if (!ctx) redirect("/auth/login")
  const userId = ctx.userId

  const sp = await searchParams
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : monthStr(new Date())
  const { from, to, days } = monthRange(month)
  const [y, mo] = month.split("-").map(Number)
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`

  // Service client bypasses payroll RLS, so every query below is pinned to the signed-in user's id.
  const svc = createServiceClient()
  const [profileRes, contractRes, payRes, lastPayRes, historyRes, attSettings, attRes, targetsRes, purchasesRes, salesRes] =
    await Promise.all([
      svc.from("profiles").select("id, full_name, role, job_title, employee_id").eq("id", userId).maybeSingle(),
      svc.from("employee_salaries").select("monthly_salary").eq("user_id", userId).maybeSingle(),
      svc
        .from("salary_payments")
        .select(
          "id, base_salary, allowances, overtime, commission, absent_days, absence_deduction, late_minutes, late_deduction, other_deductions, deductions, net_amount, payment_method, reference, paid_on",
        )
        .eq("user_id", userId)
        .eq("period_month", from)
        .maybeSingle(),
      svc
        .from("salary_payments")
        .select("base_salary, allowances")
        .eq("user_id", userId)
        .lt("period_month", from)
        .order("period_month", { ascending: false })
        .limit(1),
      svc
        .from("salary_payments")
        .select("period_month, commission, deductions, net_amount, paid_on")
        .eq("user_id", userId)
        .order("period_month", { ascending: false })
        .limit(12),
      loadAttendanceSettings(svc),
      svc.from("attendance").select(RECORD_COLUMNS).eq("user_id", userId).gte("work_date", from).lte("work_date", to),
      svc.from("staff_targets").select("kind, monthly_target").eq("user_id", userId),
      svc
        .from("supplier_invoices")
        .select("total")
        .eq("created_by", userId)
        .eq("status", "confirmed")
        .is("deleted_at", null)
        .or(`and(invoice_date.gte.${from},invoice_date.lte.${to}),and(invoice_date.is.null,created_at.gte.${from},created_at.lt.${next})`),
      svc
        .from("invoices")
        .select("total, jobs!inner(advisor_id, technician_id)")
        .neq("status", "cancelled")
        .gte("issue_date", from)
        .lte("issue_date", to)
        .or(`advisor_id.eq.${userId},technician_id.eq.${userId}`, { referencedTable: "jobs" }),
    ])

  const profile = profileRes.data
  const role = (profile?.role as string) ?? shellUser.role
  const tracked = !["owner", "marketing"].includes(role)
  const summary = tracked
    ? buildSummaries(
        [{ id: userId, full_name: profile?.full_name ?? shellUser.name, role } as never],
        (attRes.data ?? []) as AttendanceRecord[],
        attSettings,
        days,
        localDate(),
      )[0]
    : null

  const rules = {
    basisDays: basisDaysFor(attSettings, days),
    shiftMinutes: Math.max(1, shiftMinutes(attSettings)),
    absenceFactor: attSettings.absence_deduction_days,
    lateEnabled: attSettings.late_deduction_enabled,
  }

  const p = payRes.data
  const last = lastPayRes.data?.[0]
  const me: SalaryStaff = {
    userId,
    name: (profile?.full_name as string) || shellUser.name,
    role,
    title: (profile?.job_title as string) ?? "",
    employeeId: (profile?.employee_id as string) ?? "",
    payment: p
      ? {
          id: p.id,
          base: Number(p.base_salary) || 0,
          allowances: Number(p.allowances) || 0,
          overtime: Number(p.overtime) || 0,
          commission: Number(p.commission) || 0,
          absentDays: Number(p.absent_days) || 0,
          absenceDeduction: Number(p.absence_deduction) || 0,
          lateMinutes: Number(p.late_minutes) || 0,
          lateDeduction: Number(p.late_deduction) || 0,
          otherDeductions: Number(p.other_deductions) || 0,
          deductions: Number(p.deductions) || 0,
          net: Number(p.net_amount) || 0,
          method: p.payment_method,
          reference: p.reference ?? "",
          paidOn: String(p.paid_on).slice(0, 10),
        }
      : null,
    suggestedBase: Number(contractRes.data?.monthly_salary) || (last ? Number(last.base_salary) || 0 : 0),
    suggestedAllowances: last ? Number(last.allowances) || 0 : 0,
    attendance: summary
      ? {
          present: summary.present,
          absentDays: summary.absent,
          lateDays: summary.late,
          lateMinutes: summary.lateMinutes,
          leaveDays: summary.leave + summary.sick,
          overtimeMinutes: summary.overtimeMinutes,
        }
      : null,
  }

  const sum = (rows: { total: unknown }[] | null) => {
    let total = 0
    for (const r of rows ?? []) total += Number(r.total) || 0
    return { total, count: rows?.length ?? 0 }
  }
  const purchases = sum(purchasesRes.data)
  const salesRows = (salesRes.data ?? []) as unknown as { total: number | null; jobs: { advisor_id: string | null; technician_id: string | null } }[]
  const sales = sum(salesRows.filter((r) => r.jobs?.advisor_id === userId))
  const techWork = sum(salesRows.filter((r) => r.jobs?.technician_id === userId))
  const achieved: Record<TargetKind, { total: number; count: number }> = { purchase: purchases, sales, technician: techWork }

  const targets: MyTarget[] = (targetsRes.data ?? [])
    .map((t) => ({
      kind: t.kind as TargetKind,
      target: Number(t.monthly_target) || 0,
      achieved: achieved[t.kind as TargetKind]?.total ?? 0,
      count: achieved[t.kind as TargetKind]?.count ?? 0,
    }))
    .filter((t) => t.target > 0)

  const history: MyPayslip[] = (historyRes.data ?? []).map((h) => ({
    month: String(h.period_month).slice(0, 7),
    commission: Number(h.commission) || 0,
    deductions: Number(h.deductions) || 0,
    net: Number(h.net_amount) || 0,
    paidOn: String(h.paid_on).slice(0, 10),
  }))

  return (
    <AppShell user={shellUser}>
      <MyPayView
        month={month}
        name={me.name}
        title={me.title}
        employeeId={me.employeeId}
        statement={statementFor(me, rules)}
        attendance={me.attendance ?? null}
        payment={me.payment}
        targets={targets}
        history={history}
      />
    </AppShell>
  )
}
