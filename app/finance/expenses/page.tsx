import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { ExpensesPayrollView, type BizExpense, type StaffPay } from "@/components/expenses-payroll-view"
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

export const metadata = { title: "Expenses & Salaries · SHWURX Auto Service Center" }

const monthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePageAccess(["expenses.manage", "payroll.manage", "reports.financial"], "Expenses & Salaries")
  const sp = await searchParams
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : monthStr(new Date())
  const [y, mo] = month.split("-").map(Number)
  const from = `${month}-01`
  const to = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`

  const supabase = await createClient()
  const [shellUser, canExpenses, canPayroll, expRes, staffRes, payRes, lastPayRes, attSettings, attRes, salaryRes] = await Promise.all([
    getShellUser(),
    can("expenses.manage"),
    can("payroll.manage"),
    supabase
      .from("business_expenses")
      .select("id, category, description, vendor, amount, vat_amount, expense_date, bill_month, payment_method, reference, has_invoice, receipt_path")
      .or(`and(expense_date.gte.${from},expense_date.lte.${to}),bill_month.eq.${from}`)
      .order("expense_date", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, role, job_title, employee_id, created_at")
      .eq("is_active", true)
      .neq("role", "customer")
      .order("full_name"),
    supabase
      .from("salary_payments")
      .select(
        "id, user_id, base_salary, allowances, overtime, commission, absent_days, absence_deduction, late_minutes, late_deduction, other_deductions, deductions, net_amount, payment_method, reference, paid_on",
      )
      .eq("period_month", from),
    supabase
      .from("salary_payments")
      .select("user_id, base_salary, allowances, period_month")
      .lt("period_month", from)
      .order("period_month", { ascending: false })
      .limit(500),
    loadAttendanceSettings(supabase),
    supabase.from("attendance").select(RECORD_COLUMNS).gte("work_date", from).lte("work_date", to),
    supabase.from("employee_salaries").select("user_id, monthly_salary"),
  ])

  const { days } = monthRange(month)
  const tracked = (staffRes.data ?? []).filter((s: any) => !["owner", "marketing"].includes(s.role))
  const summaries = new Map(
    buildSummaries(tracked, (attRes.data ?? []) as AttendanceRecord[], attSettings, days, localDate()).map((s) => [s.userId, s]),
  )
  const contractSalary = new Map((salaryRes.data ?? []).map((s: any) => [s.user_id as string, Number(s.monthly_salary) || 0]))
  const rules = {
    basisDays: basisDaysFor(attSettings, days),
    shiftMinutes: Math.max(1, shiftMinutes(attSettings)),
    absenceFactor: attSettings.absence_deduction_days,
    lateEnabled: attSettings.late_deduction_enabled,
  }

  const expenses: BizExpense[] = (expRes.data ?? []).map((e: any) => ({
    id: e.id,
    category: e.category,
    description: e.description ?? "",
    vendor: e.vendor ?? "",
    amount: Number(e.amount) || 0,
    vat: Number(e.vat_amount) || 0,
    date: String(e.expense_date).slice(0, 10),
    billMonth: e.bill_month ? String(e.bill_month).slice(0, 7) : null,
    method: e.payment_method || "cash",
    reference: e.reference ?? "",
    hasInvoice: !!e.has_invoice,
    receiptPath: e.receipt_path ?? null,
  }))

  const paidMap = new Map((payRes.data ?? []).map((p: any) => [p.user_id, p]))
  const lastMap = new Map<string, any>()
  for (const p of lastPayRes.data ?? []) if (!lastMap.has(p.user_id)) lastMap.set(p.user_id, p)

  const staff: StaffPay[] = (staffRes.data ?? []).map((s: any) => {
    const p = paidMap.get(s.id)
    const last = lastMap.get(s.id)
    const sum = summaries.get(s.id)
    return {
      userId: s.id,
      name: s.full_name || "Unnamed",
      role: s.role,
      title: s.job_title ?? "",
      employeeId: s.employee_id ?? "",
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
      suggestedBase: contractSalary.get(s.id) || (last ? Number(last.base_salary) || 0 : 0),
      suggestedAllowances: last ? Number(last.allowances) || 0 : 0,
      attendance: sum
        ? {
            present: sum.present,
            absentDays: sum.absent,
            lateDays: sum.late,
            lateMinutes: sum.lateMinutes,
            leaveDays: sum.leave + sum.sick,
            overtimeMinutes: sum.overtimeMinutes,
          }
        : null,
    }
  })

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <ExpensesPayrollView
          month={month}
          expenses={expenses}
          staff={staff}
          payrollRules={rules}
          canExpenses={canExpenses}
          canPayroll={canPayroll}
        />
      </div>
    </AppShell>
  )
}
