import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { MyPayView, type MyPayslip } from "@/components/my-pay-view"
import { statementFor, type SalaryStaff } from "@/lib/salary-statement"
import { loadTargetProgress } from "@/lib/target-progress"
import {
  RECORD_COLUMNS,
  basisDaysFor,
  buildSummaries,
  employedDays,
  loadAttendanceSettings,
  localDate,
  monthRange,
  type AttendanceRecord,
} from "@/lib/attendance"

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

  // Service client bypasses payroll RLS, so every query below is pinned to the signed-in user's id.
  const svc = createServiceClient()
  const [profileRes, contractRes, payRes, lastPayRes, historyRes, attSettings, attRes, targetMap] = await Promise.all([
    svc.from("profiles").select("id, full_name, role, job_title, employee_id").eq("id", userId).maybeSingle(),
    svc.from("employee_salaries").select("monthly_salary, start_date").eq("user_id", userId).maybeSingle(),
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
    loadTargetProgress(svc, month, userId),
  ])

  const profile = profileRes.data
  const role = (profile?.role as string) ?? shellUser.role
  const startDate = (contractRes.data?.start_date as string | null) ?? null
  const tracked = !["owner", "marketing"].includes(role)
  const summary = tracked
    ? buildSummaries(
        [{ id: userId, full_name: profile?.full_name ?? shellUser.name, role, start_date: startDate } as never],
        (attRes.data ?? []) as AttendanceRecord[],
        attSettings,
        days,
        localDate(),
      )[0]
    : null

  const rules = {
    basisDays: basisDaysFor(attSettings, days),
    absenceFactor: attSettings.absence_deduction_days,
    lateEnabled: attSettings.late_deduction_enabled,
    lateFeePerHour: attSettings.late_fee_per_hour,
    lateFeeUnderHalf: attSettings.late_fee_under_half,
  }

  const targets = targetMap.get(userId) ?? []
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
    startDate,
    daysInMonth: days.length,
    daysEmployed: employedDays(days, startDate),
    targets,
    attendance: summary
      ? {
          present: summary.present,
          absentDays: summary.absent,
          lateDays: summary.late,
          lateMinutes: summary.lateMinutes,
          lateFee: summary.lateFee,
          leaveDays: summary.leave + summary.sick,
          overtimeMinutes: summary.overtimeMinutes,
        }
      : null,
  }

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
        startDate={startDate}
      />
    </AppShell>
  )
}
