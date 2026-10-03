"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { ctxCan, ctxCanAny, logAction, requireStaff } from "@/lib/rbac/context"
import {
  RECORD_COLUMNS,
  distanceMeters,
  lateMinutesFor,
  loadAttendanceSettings,
  localDate,
  localToIso,
  type AttendanceStatus,
} from "@/lib/attendance"

type Result = { ok: true; message?: string } | { ok: false; error: string }
type Coords = { lat: number; lng: number; accuracy?: number | null } | null

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "leave", "sick", "off"]

function validCoords(c: Coords): Coords {
  if (!c) return null
  const { lat, lng } = c
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const accuracy = Number.isFinite(c.accuracy) ? Math.round(Number(c.accuracy)) : null
  return { lat, lng, accuracy }
}

/** Self check-in/out is only accepted from inside the workshop geofence with a reasonably precise GPS fix. */
async function locationCheck(coords: Coords) {
  const svc = createServiceClient()
  const settings = await loadAttendanceSettings(svc)
  if (settings.workshop_lat == null || settings.workshop_lng == null) {
    return { error: "The workshop location has not been set yet. Ask a manager to set it in Attendance → Shift settings." }
  }
  const c = validCoords(coords)
  if (!c) {
    return { error: "Location is required. Turn on location (GPS) and allow this site to use it, then try again." }
  }
  if (c.accuracy != null && c.accuracy > settings.max_gps_accuracy_m) {
    return {
      error: `Your GPS signal is too weak (±${c.accuracy} m). Step outside or near a window, wait a few seconds and try again.`,
    }
  }
  const distance = distanceMeters(c.lat, c.lng, settings.workshop_lat, settings.workshop_lng)
  if (distance > settings.geofence_radius_m) {
    return {
      error: `You are ${distance} m away from the workshop. Check-in/out is only allowed within ${settings.geofence_radius_m} m.`,
    }
  }
  return { svc, settings, c, distance }
}

export async function checkIn(coords: Coords, note?: string): Promise<Result> {
  const ctx = await requireStaff()
  if (ctx.role === "owner") return { ok: false, error: "The owner account is not tracked by attendance." }
  const chk = await locationCheck(coords)
  if ("error" in chk) return { ok: false, error: chk.error as string }
  const { svc, settings, c, distance } = chk

  const now = new Date()
  const today = localDate(now)
  const { data: existing } = await svc
    .from("attendance")
    .select("id, check_in_at, status")
    .eq("user_id", ctx.userId)
    .eq("work_date", today)
    .maybeSingle()
  if (existing?.check_in_at) return { ok: false, error: "You have already checked in today." }
  if (existing && ["leave", "sick", "off"].includes(existing.status)) {
    return { ok: false, error: `Today is marked as ${existing.status}. Ask a manager to change it.` }
  }

  const iso = now.toISOString()
  const late = lateMinutesFor(iso, settings)
  const row = {
    user_id: ctx.userId,
    work_date: today,
    check_in_at: iso,
    check_in_lat: c?.lat ?? null,
    check_in_lng: c?.lng ?? null,
    check_in_distance_m: distance,
    check_in_accuracy_m: c?.accuracy ?? null,
    check_in_note: note?.trim().slice(0, 300) || null,
    status: late > 0 ? "late" : "present",
    source: "self",
    updated_at: iso,
  }
  const { data, error } = await svc.from("attendance").upsert(row, { onConflict: "user_id,work_date" }).select("id").single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, "attendance.check_in", "attendance", data.id, { late_minutes: late, distance_m: distance })
  revalidatePath("/attendance")
  return { ok: true, message: late > 0 ? `Checked in — ${late} min late` : "Checked in on time" }
}

export async function checkOut(coords: Coords, note?: string): Promise<Result> {
  const ctx = await requireStaff()
  const chk = await locationCheck(coords)
  if ("error" in chk) return { ok: false, error: chk.error as string }
  const { svc, c, distance } = chk

  const now = new Date()
  // Newest open shift within the last 20 hours, so a shift that runs past midnight can still be closed.
  const since = new Date(now.getTime() - 20 * 3600 * 1000).toISOString()
  const { data: open } = await svc
    .from("attendance")
    .select("id, check_in_at")
    .eq("user_id", ctx.userId)
    .is("check_out_at", null)
    .not("check_in_at", "is", null)
    .gte("check_in_at", since)
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!open) return { ok: false, error: "No open check-in found. Check in first." }

  const iso = now.toISOString()
  const { error } = await svc
    .from("attendance")
    .update({
      check_out_at: iso,
      check_out_lat: c?.lat ?? null,
      check_out_lng: c?.lng ?? null,
      check_out_distance_m: distance,
      check_out_accuracy_m: c?.accuracy ?? null,
      check_out_note: note?.trim().slice(0, 300) || null,
      updated_at: iso,
    })
    .eq("id", open.id)
  if (error) return { ok: false, error: error.message }

  const mins = Math.round((now.getTime() - new Date(open.check_in_at).getTime()) / 60000)
  await logAction(ctx, "attendance.check_out", "attendance", open.id, { worked_minutes: mins, distance_m: distance })
  revalidatePath("/attendance")
  return { ok: true, message: "Checked out" }
}

export interface ManualRecordInput {
  userId: string
  workDate: string
  checkIn: string
  checkOut: string
  status: AttendanceStatus
  breakMinutes: number
  reason: string
}

export async function saveManualRecord(input: ManualRecordInput): Promise<Result> {
  const ctx = await requireStaff()
  if (!ctxCan(ctx, "attendance.manage")) return { ok: false, error: "You don't have permission to edit attendance." }

  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, error: "Enter a reason for this correction." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) return { ok: false, error: "Invalid date." }
  if (!STATUSES.includes(input.status)) return { ok: false, error: "Invalid status." }
  const hhmm = /^\d{2}:\d{2}$/
  if (input.checkIn && !hhmm.test(input.checkIn)) return { ok: false, error: "Invalid check-in time." }
  if (input.checkOut && !hhmm.test(input.checkOut)) return { ok: false, error: "Invalid check-out time." }
  if (input.checkOut && !input.checkIn) return { ok: false, error: "Check-out needs a check-in time." }
  const works = input.status === "present" || input.status === "late"
  if (works && !input.checkIn) return { ok: false, error: "Present/late needs a check-in time." }

  const svc = createServiceClient()
  const { data: staff } = await svc.from("profiles").select("id, role").eq("id", input.userId).maybeSingle()
  if (!staff || staff.role === "customer") return { ok: false, error: "Employee not found." }
  if (staff.role === "owner") return { ok: false, error: "The owner account is not tracked by attendance." }

  const checkInIso = works && input.checkIn ? localToIso(input.workDate, input.checkIn) : null
  let checkOutIso = works && input.checkOut ? localToIso(input.workDate, input.checkOut) : null
  if (checkInIso && checkOutIso && checkOutIso <= checkInIso) {
    checkOutIso = new Date(new Date(checkOutIso).getTime() + 86400000).toISOString()
  }

  const { data: before } = await svc
    .from("attendance")
    .select(RECORD_COLUMNS)
    .eq("user_id", input.userId)
    .eq("work_date", input.workDate)
    .maybeSingle()

  const now = new Date().toISOString()
  const { data, error } = await svc
    .from("attendance")
    .upsert(
      {
        user_id: input.userId,
        work_date: input.workDate,
        check_in_at: checkInIso,
        check_out_at: checkOutIso,
        status: input.status,
        break_minutes: Math.max(0, Math.min(600, Math.round(input.breakMinutes || 0))),
        source: "manual",
        edited_by: ctx.userId,
        edit_reason: reason.slice(0, 300),
        updated_at: now,
      },
      { onConflict: "user_id,work_date" },
    )
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, before ? "attendance.edit" : "attendance.manual_add", "attendance", data.id, {
    employee_id: input.userId,
    date: input.workDate,
    reason,
    before,
    after: { check_in: input.checkIn, check_out: input.checkOut, status: input.status, break: input.breakMinutes },
  })
  revalidatePath("/attendance")
  return { ok: true, message: "Attendance saved" }
}

export async function deleteAttendanceRecord(id: string, reason: string): Promise<Result> {
  const ctx = await requireStaff()
  if (!ctxCan(ctx, "attendance.manage")) return { ok: false, error: "You don't have permission to edit attendance." }
  if (reason.trim().length < 3) return { ok: false, error: "Enter a reason for deleting." }
  const svc = createServiceClient()
  const { data: before } = await svc.from("attendance").select(RECORD_COLUMNS).eq("id", id).maybeSingle()
  if (!before) return { ok: false, error: "Record not found." }
  const { error } = await svc.from("attendance").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "attendance.delete", "attendance", id, { reason: reason.trim(), before })
  revalidatePath("/attendance")
  return { ok: true, message: "Record deleted" }
}

export interface AttendanceSettingsInput {
  shiftStart: string
  shiftEnd: string
  graceMinutes: number
  offDays: number[]
  workshopLat: number | null
  workshopLng: number | null
  radius: number
  maxAccuracy: number
  startDate: string
  dayBasis: "30" | "calendar" | "working"
  absenceDeductionDays: number
  lateDeduction: boolean
}

export async function saveAttendanceSettings(input: AttendanceSettingsInput): Promise<Result> {
  const ctx = await requireStaff()
  if (!ctxCanAny(ctx, ["attendance.manage", "settings.manage"])) {
    return { ok: false, error: "You don't have permission to change attendance settings." }
  }
  const hhmm = /^\d{2}:\d{2}$/
  if (!hhmm.test(input.shiftStart) || !hhmm.test(input.shiftEnd)) return { ok: false, error: "Invalid shift times." }
  if (input.shiftEnd <= input.shiftStart) return { ok: false, error: "Shift end must be after shift start." }
  const coords = input.workshopLat != null && input.workshopLng != null
    ? validCoords({ lat: input.workshopLat, lng: input.workshopLng })
    : null
  if (!coords) return { ok: false, error: "Set the workshop location (press \"Use my location\" while at the workshop)." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { ok: false, error: "Invalid attendance start date." }
  if (!["30", "calendar", "working"].includes(input.dayBasis)) return { ok: false, error: "Invalid salary day basis." }

  const update = {
    shift_start: input.shiftStart,
    shift_end: input.shiftEnd,
    attendance_grace_minutes: Math.max(0, Math.min(120, Math.round(input.graceMinutes || 0))),
    attendance_off_days: [...new Set(input.offDays.filter((d) => d >= 0 && d <= 6))].sort(),
    workshop_lat: coords?.lat ?? null,
    workshop_lng: coords?.lng ?? null,
    geofence_radius_m: Math.max(50, Math.min(5000, Math.round(input.radius || 300))),
    attendance_require_location: true,
    max_gps_accuracy_m: Math.max(20, Math.min(1000, Math.round(input.maxAccuracy || 150))),
    attendance_start_date: input.startDate,
    payroll_day_basis: input.dayBasis,
    absence_deduction_days: Math.max(0, Math.min(3, Math.round((input.absenceDeductionDays || 0) * 100) / 100)),
    late_deduction_enabled: input.lateDeduction,
  }
  const svc = createServiceClient()
  const { error } = await svc.from("settings").update(update).eq("id", 1)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "attendance.settings_update", "settings", "1", update)
  revalidatePath("/attendance")
  return { ok: true, message: "Settings saved" }
}

export async function saveEmployeeSalary(userId: string, monthlySalary: number): Promise<Result> {
  const ctx = await requireStaff()
  if (!ctxCan(ctx, "attendance.manage")) return { ok: false, error: "You don't have permission to edit salaries." }
  const amount = Math.round(Number(monthlySalary) * 100) / 100
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return { ok: false, error: "Enter a valid salary." }
  const svc = createServiceClient()
  const { data: staff } = await svc.from("profiles").select("id, role").eq("id", userId).maybeSingle()
  if (!staff || staff.role === "customer") return { ok: false, error: "Employee not found." }
  const { data: before } = await svc.from("employee_salaries").select("monthly_salary").eq("user_id", userId).maybeSingle()
  const { error } = await svc
    .from("employee_salaries")
    .upsert({ user_id: userId, monthly_salary: amount, updated_by: ctx.userId, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "payroll.salary_update", "employee_salaries", userId, {
    before: before?.monthly_salary ?? null,
    after: amount,
  })
  revalidatePath("/attendance")
  return { ok: true, message: "Salary saved" }
}
