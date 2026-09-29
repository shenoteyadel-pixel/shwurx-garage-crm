import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSettings } from "@/lib/settings"
import { ctxCan, ctxCanAny, requireStaff } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { AttendanceView } from "@/components/attendance-view"
import {
  RECORD_COLUMNS,
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
  const [shellUser, company, settings, staffRes, recordsRes, todayRes] = await Promise.all([
    getShellUser(),
    getSettings(),
    loadAttendanceSettings(supabase),
    canViewAll
      ? supabase.from("profiles").select("id, full_name, role").eq("is_active", true).neq("role", "customer").order("full_name")
      : Promise.resolve({ data: [{ id: ctx.userId, full_name: ctx.name, role: ctx.role }] }),
    (() => {
      const q = supabase.from("attendance").select(RECORD_COLUMNS).gte("work_date", from).lte("work_date", to)
      return (canViewAll ? q : q.eq("user_id", ctx.userId)).order("work_date", { ascending: false })
    })(),
    (() => {
      const q = supabase.from("attendance").select(RECORD_COLUMNS).eq("work_date", today)
      return canViewAll ? q : q.eq("user_id", ctx.userId)
    })(),
  ])

  const staff = (staffRes.data ?? []) as StaffMember[]
  const records = (recordsRes.data ?? []) as AttendanceRecord[]
  const todayRecords = (todayRes.data ?? []) as AttendanceRecord[]
  const summaries = buildSummaries(staff, records, settings, days, today)

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
          canViewAll={canViewAll}
          canManage={canManage}
          canEditSettings={canEditSettings}
          company={{ name: company.legal_name || company.company_name, trn: company.trn, address: company.address }}
        />
      </div>
    </AppShell>
  )
}
