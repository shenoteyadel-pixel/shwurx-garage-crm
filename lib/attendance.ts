import type { SupabaseClient } from "@supabase/supabase-js"

export const TZ = "Asia/Dubai"
const TZ_OFFSET = "+04:00"

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "sick" | "off"

export interface AttendanceSettings {
  shift_start: string
  shift_end: string
  attendance_grace_minutes: number
  attendance_off_days: number[]
  workshop_lat: number | null
  workshop_lng: number | null
  geofence_radius_m: number
  attendance_require_location: boolean
  max_gps_accuracy_m: number
  attendance_start_date: string
  payroll_day_basis: PayrollBasis
  absence_deduction_days: number
  late_deduction_enabled: boolean
}

export type PayrollBasis = "30" | "calendar" | "working"

export interface PayrollLine {
  userId: string
  name: string
  role: string
  salary: number
  basisDays: number
  dailyRate: number
  absentDays: number
  absenceDeduction: number
  lateMinutes: number
  lateDeduction: number
  missingCheckout: number
  totalDeduction: number
  net: number
}

export interface AttendanceRecord {
  id: string
  user_id: string
  work_date: string
  check_in_at: string | null
  check_out_at: string | null
  check_in_distance_m: number | null
  check_out_distance_m: number | null
  check_in_note: string | null
  check_out_note: string | null
  status: AttendanceStatus
  break_minutes: number
  source: "self" | "manual"
  edit_reason: string | null
}

export interface StaffMember {
  id: string
  full_name: string | null
  role: string
  created_at?: string | null
}

export interface EmployeeSummary {
  userId: string
  name: string
  role: string
  present: number
  late: number
  absent: number
  leave: number
  sick: number
  workedMinutes: number
  overtimeMinutes: number
  lateMinutes: number
  missingCheckout: number
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  shift_start: "08:00",
  shift_end: "18:00",
  attendance_grace_minutes: 10,
  attendance_off_days: [5],
  workshop_lat: null,
  workshop_lng: null,
  geofence_radius_m: 300,
  attendance_require_location: true,
  max_gps_accuracy_m: 150,
  attendance_start_date: "2026-01-01",
  payroll_day_basis: "30",
  absence_deduction_days: 1,
  late_deduction_enabled: true,
}

export const RECORD_COLUMNS =
  "id, user_id, work_date, check_in_at, check_out_at, check_in_distance_m, check_out_distance_m, check_in_note, check_out_note, status, break_minutes, source, edit_reason"

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Calendar date (YYYY-MM-DD) in workshop local time. */
export function localDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

/** Minutes since local midnight in workshop time. */
export function localMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d)
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return h * 60 + m
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Build an ISO timestamp from a local date + HH:MM in workshop time. */
export function localToIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm.slice(0, 5)}:00${TZ_OFFSET}`).toISOString()
}

export function isoToLocalHHMM(iso: string | null): string {
  if (!iso) return ""
  const m = localMinutes(new Date(iso))
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  )
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00${TZ_OFFSET}`).getUTCDay()
}

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

export function workedMinutes(r: Pick<AttendanceRecord, "check_in_at" | "check_out_at" | "break_minutes">, now = new Date()) {
  if (!r.check_in_at) return 0
  const end = r.check_out_at ? new Date(r.check_out_at) : now
  return Math.max(0, (end.getTime() - new Date(r.check_in_at).getTime()) / 60000 - (r.break_minutes || 0))
}

export function lateMinutesFor(checkInIso: string | null, s: AttendanceSettings): number {
  if (!checkInIso) return 0
  const diff = localMinutes(new Date(checkInIso)) - hhmmToMinutes(s.shift_start)
  return diff > s.attendance_grace_minutes ? diff : 0
}

export function shiftMinutes(s: AttendanceSettings): number {
  return Math.max(0, hhmmToMinutes(s.shift_end) - hhmmToMinutes(s.shift_start))
}

export function monthRange(month: string): { from: string; to: string; days: string[] } {
  const [y, m] = month.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)
  return { from: days[0], to: days[days.length - 1], days }
}

export function buildSummaries(
  staff: StaffMember[],
  records: AttendanceRecord[],
  s: AttendanceSettings,
  days: string[],
  today: string,
): EmployeeSummary[] {
  const byUser = new Map<string, Map<string, AttendanceRecord>>()
  for (const r of records) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map())
    byUser.get(r.user_id)!.set(r.work_date, r)
  }
  const scheduled = shiftMinutes(s)

  return staff.map((st) => {
    const recs = byUser.get(st.id) ?? new Map<string, AttendanceRecord>()
    const sum: EmployeeSummary = {
      userId: st.id,
      name: st.full_name || "Unnamed",
      role: st.role,
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      sick: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      missingCheckout: 0,
    }
    const joined = st.created_at ? localDate(new Date(st.created_at)) : ""
    const trackingStart = joined > s.attendance_start_date ? joined : s.attendance_start_date
    for (const day of days) {
      if (day > today) break
      const r = recs.get(day)
      if (!r) {
        if (day < today && day >= trackingStart && !s.attendance_off_days.includes(weekdayOf(day))) sum.absent++
        continue
      }
      if (r.status === "leave") sum.leave++
      else if (r.status === "sick") sum.sick++
      else if (r.status === "absent") sum.absent++
      else if (r.status === "off") continue
      else if (r.check_in_at) {
        sum.present++
        const late = lateMinutesFor(r.check_in_at, s)
        if (late > 0 || r.status === "late") {
          sum.late++
          sum.lateMinutes += late
        }
        if (!r.check_out_at && day < today) {
          sum.missingCheckout++
          continue
        }
        const w = workedMinutes(r)
        sum.workedMinutes += w
        if (w > scheduled) sum.overtimeMinutes += w - scheduled
      }
    }
    return sum
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function basisDaysFor(s: AttendanceSettings, days: string[]): number {
  if (s.payroll_day_basis === "calendar") return days.length
  if (s.payroll_day_basis === "working") {
    return Math.max(1, days.filter((d) => !s.attendance_off_days.includes(weekdayOf(d))).length)
  }
  return 30
}

/** Salary deductions: each absent day costs (daily rate × absence_deduction_days); late time is charged pro-rata per minute of the shift. */
export function buildPayroll(
  summaries: EmployeeSummary[],
  salaries: Map<string, number>,
  s: AttendanceSettings,
  days: string[],
): PayrollLine[] {
  const basisDays = basisDaysFor(s, days)
  const shift = Math.max(1, shiftMinutes(s))
  return summaries.map((sum) => {
    const salary = salaries.get(sum.userId) ?? 0
    const dailyRate = salary / basisDays
    const absenceDeduction = round2(sum.absent * s.absence_deduction_days * dailyRate)
    const lateDeduction = s.late_deduction_enabled ? round2((sum.lateMinutes / shift) * dailyRate) : 0
    const totalDeduction = Math.min(salary, round2(absenceDeduction + lateDeduction))
    return {
      userId: sum.userId,
      name: sum.name,
      role: sum.role,
      salary,
      basisDays,
      dailyRate: round2(dailyRate),
      absentDays: sum.absent,
      absenceDeduction,
      lateMinutes: sum.lateMinutes,
      lateDeduction,
      missingCheckout: sum.missingCheckout,
      totalDeduction,
      net: round2(salary - totalDeduction),
    }
  })
}

export async function loadAttendanceSettings(supabase: SupabaseClient): Promise<AttendanceSettings> {
  const { data } = await supabase
    .from("settings")
    .select(
      "shift_start, shift_end, attendance_grace_minutes, attendance_off_days, workshop_lat, workshop_lng, geofence_radius_m, attendance_require_location, max_gps_accuracy_m, attendance_start_date, payroll_day_basis, absence_deduction_days, late_deduction_enabled",
    )
    .eq("id", 1)
    .maybeSingle()
  if (!data) return DEFAULT_ATTENDANCE_SETTINGS
  return {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    ...data,
    shift_start: String(data.shift_start ?? "08:00").slice(0, 5),
    shift_end: String(data.shift_end ?? "18:00").slice(0, 5),
    attendance_off_days: data.attendance_off_days ?? [],
    absence_deduction_days: Number(data.absence_deduction_days ?? 1),
    attendance_start_date: String(data.attendance_start_date ?? DEFAULT_ATTENDANCE_SETTINGS.attendance_start_date),
  }
}
