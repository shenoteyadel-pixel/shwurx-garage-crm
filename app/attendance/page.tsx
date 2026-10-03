import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSettings } from "@/lib/settings"
import { ctxCan, ctxCanAny, requireStaff } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { AttendanceView } from "@/components/attendance-view"
import {
  RECORD_COLUMNS,
  buildPayroll,
  buildSummaries,
  loadAttendanceSettings,
  localDate,
  monthRange,
  type AttendanceRecord,
  type StaffMember,
} from "@/lib/attendance"

export const metadata = { title: "Attendance · SHWURX Auto Service Center" }

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams
  const ctx = await requireStaff()
  const today = localDate()
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7)
  const { from, to, days } = monthRange(month)

  const canViewAll = ctxCanAny(ctx, ["attendance.view_all", "attendance.manage"])
  const canManage = ctxCan(ctx, "attendance.manage")
  const canEditSettings = ctxCanAny(ctx, ["attendance.manage", "settings.manage"])

  const supabase = await createClient()
  const [shellUser, company, settings, staffRes, recordsRes, todayRes, salaryRes] = await Promise.all([
    getShellUser(),
    getSettings(),
    loadAttendanceSettings(supabase),
    canViewAll
      ? supabase
          .from("profiles")
          .select("id, full_name, role, created_at")
          .eq("is_active", true)
          .not("role", "in", "(customer,owner)")
          .order("full_name")
      : supabase.from("profiles").select("id, full_name, role, created_at").eq("id", ctx.userId),
    (() => {
      const q = supabase.from("attendance").select(RECORD_COLUMNS).gte("work_date", from).lte("work_date", to)
      return (canViewAll ? q : q.eq("user_id", ctx.userId)).order("work_date", { ascending: false })
    })(),
    (() => {
      const q = supabase.from("attendance").select(RECORD_COLUMNS).eq("work_date", today)
      return canViewAll ? q : q.eq("user_id", ctx.userId)
    })(),
    (() => {
      const q = supabase.from("employee_salaries").select("user_id, monthly_salary")
      return canManage ? q : q.eq("user_id", ctx.userId)
    })(),
  ])

  const isOwner = ctx.role === "owner"
  const staff = (
    staffRes.data?.length || isOwner ? (staffRes.data ?? []) : [{ id: ctx.userId, full_name: ctx.name, role: ctx.role }]
  ) as StaffMember[]
  const trackedIds = new Set(staff.map((s) => s.id))
  const records = ((recordsRes.data ?? []) as AttendanceRecord[]).filter((r) => trackedIds.has(r.user_id))
  const todayRecords = ((todayRes.data ?? []) as AttendanceRecord[]).filter((r) => trackedIds.has(r.user_id))
  const summaries = buildSummaries(staff, records, settings, days, today)
  const salaries = new Map((salaryRes.data ?? []).map((s) => [s.user_id as string, Number(s.monthly_salary)]))
  const payroll = buildPayroll(summaries, salaries, settings, days)

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <AttendanceView
          me={{ id: ctx.userId, name: ctx.name }}
          today={today}
          month={month}
          settings={settings}
          staff={staff}
          records={records}
          todayRecords={todayRecords}
          summaries={summaries}
          payroll={payroll}
          selfTracked={!isOwner}
          canViewAll={canViewAll}
          canManage={canManage}
          canEditSettings={canEditSettings}
          company={{ name: company.legal_name || company.company_name, trn: company.trn, address: company.address }}
        />
      </div>
    </AppShell>
  )
}
