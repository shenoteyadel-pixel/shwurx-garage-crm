import { NextResponse } from "next/server"
import { getSessionContext } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import {
  hhmmToMinutes,
  loadAttendanceSettings,
  localDate,
  localMinutes,
  weekdayOf,
} from "@/lib/attendance"
import type { AlertKind } from "@/lib/i18n/crm"

export const dynamic = "force-dynamic"

export interface CrmAlert {
  id: string
  kind: AlertKind
  severity: "critical" | "warning" | "info"
  href: string
  minutes?: number
  count?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET() {
  const ctx = await getSessionContext()
  if (!ctx || !ctx.isStaff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const svc = createServiceClient()
  const perms = ctx.permissions as Set<string>
  const isOwner = ctx.role === "owner"
  const has = (p: string) => isOwner || perms.has(p)
  const now = new Date()
  const today = localDate(now)
  const alerts: CrmAlert[] = []

  const [{ data: profile }, settings, { data: attendance }] = await Promise.all([
    svc.from("profiles").select("guide_seen_version").eq("id", ctx.userId).maybeSingle(),
    loadAttendanceSettings(svc),
    svc
      .from("attendance")
      .select("check_in_at, check_out_at, status")
      .eq("user_id", ctx.userId)
      .eq("work_date", today)
      .maybeSingle(),
  ])

  const startDate = String(settings.attendance_start_date ?? "").slice(0, 10)
  const isWorkDay =
    !settings.attendance_off_days.includes(weekdayOf(today)) && (!startDate || today >= startDate)
  const onLeave = attendance && ["leave", "sick", "off"].includes(attendance.status)

  if (!isOwner && isWorkDay && !onLeave) {
    const nowMin = localMinutes(now)
    const startMin = hhmmToMinutes(settings.shift_start)
    const endMin = hhmmToMinutes(settings.shift_end)
    const lateBy = nowMin - startMin

    if (!attendance?.check_in_at) {
      if (lateBy > settings.attendance_grace_minutes && nowMin < endMin) {
        alerts.push({ id: `late_no_checkin:${today}`, kind: "late_no_checkin", severity: "critical", href: "/attendance", minutes: lateBy })
      }
    } else {
      const checkInLate = localMinutes(new Date(attendance.check_in_at)) - startMin
      if (checkInLate > settings.attendance_grace_minutes) {
        alerts.push({ id: `late_checked_in:${today}`, kind: "late_checked_in", severity: "warning", href: "/attendance", minutes: checkInLate })
      }
      const afterEnd = nowMin - endMin
      if (!attendance.check_out_at && afterEnd > 30) {
        alerts.push({ id: `forgot_checkout:${today}`, kind: "forgot_checkout", severity: "warning", href: "/attendance", minutes: afterEnd })
      }
    }
  }

  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString()
  const checks: Promise<void>[] = []

  if (has("jobs.view_all") || has("jobs.view_assigned")) {
    checks.push(
      (async () => {
        let q = svc
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .neq("stage", "delivered")
          .not("estimated_completion", "is", null)
          .lt("estimated_completion", now.toISOString())
        if (!has("jobs.view_all")) q = q.eq("technician_id", ctx.userId)
        const { count } = await q
        if (count) alerts.push({ id: `jobs_overdue:${today}:${count}`, kind: "jobs_overdue", severity: "critical", href: "/jobs", count })
      })(),
    )
  }

  if (has("jobs.view_all") && (has("quotations.manage") || has("jobs.create"))) {
    checks.push(
      (async () => {
        const { count } = await svc
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("stage", "customer_approval")
          .eq("approval_status", "pending")
          .lt("updated_at", dayAgo)
        if (count) alerts.push({ id: `approvals_pending:${today}:${count}`, kind: "approvals_pending", severity: "warning", href: "/flow", count })
      })(),
    )
  }

  if (has("purchase_orders.manage")) {
    checks.push(
      (async () => {
        const { count } = await svc
          .from("parts_requests")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "required")
          .lt("created_at", dayAgo)
        if (count) alerts.push({ id: `parts_pending:${today}:${count}`, kind: "parts_pending", severity: "warning", href: "/purchasing", count })
      })(),
    )
  }

  await Promise.all(checks)

  const order = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => order[a.severity] - order[b.severity])

  return NextResponse.json({
    guideSeenVersion: profile?.guide_seen_version ?? 0,
    role: ctx.role,
    name: ctx.name,
    permissions: [...perms],
    alerts,
  })
}
