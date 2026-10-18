import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  RECORD_COLUMNS,
  lateMinutesFor,
  loadAttendanceSettings,
  localDate,
  weekdayOf,
  workedMinutes,
  type AttendanceRecord,
  type AttendanceSettings,
} from "@/lib/attendance"

export type DailyStatus = "on_time" | "late" | "absent" | "not_in" | "leave" | "sick" | "off"

export interface DailyRow {
  userId: string
  name: string
  role: string
  status: DailyStatus
  checkInAt: string | null
  checkOutAt: string | null
  lateMinutes: number
  workedMinutes: number
  missingCheckout: boolean
}

export interface DailyReport {
  date: string
  isOffDay: boolean
  settings: AttendanceSettings
  rows: DailyRow[]
  counts: Record<DailyStatus, number> & { total: number; present: number; missingCheckout: number }
}

/** Builds the attendance picture for one day across every active tracked employee. */
export async function buildDailyReport(svc: SupabaseClient, date: string, now = new Date()): Promise<DailyReport> {
  const settings = await loadAttendanceSettings(svc)
  const [staffRes, recRes] = await Promise.all([
    svc
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("is_active", true)
      .not("role", "in", "(customer,owner)")
      .order("full_name"),
    svc.from("attendance").select(RECORD_COLUMNS).eq("work_date", date),
  ])
  const byUser = new Map(((recRes.data ?? []) as AttendanceRecord[]).map((r) => [r.user_id, r]))
  const isOffDay = settings.attendance_off_days.includes(weekdayOf(date))
  const today = localDate(now)
  const dayOver = date < today

  const rows: DailyRow[] = []
  for (const st of staffRes.data ?? []) {
    const joined = st.created_at ? localDate(new Date(st.created_at)) : ""
    if (joined && joined > date) continue
    const r = byUser.get(st.id)
    let status: DailyStatus
    let late = 0
    if (!r) status = isOffDay ? "off" : dayOver ? "absent" : "not_in"
    else if (r.status === "leave" || r.status === "sick" || r.status === "off" || r.status === "absent") status = r.status
    else if (!r.check_in_at) status = dayOver ? "absent" : "not_in"
    else {
      late = lateMinutesFor(r.check_in_at, settings)
      status = late > 0 || r.status === "late" ? "late" : "on_time"
    }
    if (isOffDay && status === "not_in") status = "off"
    rows.push({
      userId: st.id,
      name: st.full_name || "Unnamed",
      role: st.role,
      status,
      checkInAt: r?.check_in_at ?? null,
      checkOutAt: r?.check_out_at ?? null,
      lateMinutes: late,
      workedMinutes: r?.check_in_at ? Math.round(workedMinutes(r, now)) : 0,
      missingCheckout: !!r?.check_in_at && !r.check_out_at,
    })
  }

  const counts = {
    on_time: 0,
    late: 0,
    absent: 0,
    not_in: 0,
    leave: 0,
    sick: 0,
    off: 0,
    total: rows.length,
    present: 0,
    missingCheckout: 0,
  }
  for (const r of rows) {
    counts[r.status]++
    if (r.status === "on_time" || r.status === "late") counts.present++
    if (r.missingCheckout) counts.missingCheckout++
  }
  return { date, isOffDay, settings, rows, counts }
}
