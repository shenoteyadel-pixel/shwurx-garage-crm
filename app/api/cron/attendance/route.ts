import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { localDate, formatTime, formatDuration } from "@/lib/attendance"
import { buildDailyReport, type DailyReport } from "@/lib/attendance-report"
import { attendanceManagerIds, notifyUsers } from "@/lib/attendance-notify"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com"

function names(list: { name: string }[], max = 6) {
  const shown = list.slice(0, max).map((r) => r.name)
  return list.length > max ? `${shown.join(", ")} +${list.length - max} more` : shown.join(", ")
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function reportEmail(report: DailyReport) {
  const label: Record<string, string> = {
    on_time: "On time",
    late: "Late",
    absent: "Absent",
    not_in: "Not checked in",
    leave: "Leave",
    sick: "Sick",
    off: "Day off",
  }
  const rows = report.rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #262b36">${esc(r.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #262b36">${label[r.status]}${r.lateMinutes ? ` (${r.lateMinutes} min)` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #262b36">${formatTime(r.checkInAt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #262b36">${r.checkInAt && !r.checkOutAt ? "Missing" : formatTime(r.checkOutAt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #262b36">${r.workedMinutes ? formatDuration(r.workedMinutes) : "—"}</td>
      </tr>`,
    )
    .join("")
  const c = report.counts
  return `<!doctype html><html><body style="margin:0;background:#0f1115;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#171a21;border:1px solid #262b36;border-radius:14px;padding:24px">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5aa02c;font-weight:700">SHWURX Auto Service Center</div>
    <h1 style="margin:10px 0 4px;font-size:20px;color:#fff">Daily attendance · ${report.date}</h1>
    <p style="margin:0 0 16px;color:#c4c9d4;font-size:14px">${c.present} present (${c.late} late) · ${c.absent + c.not_in} absent · ${c.leave + c.sick} on leave · ${c.missingCheckout} missing check-out</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#e5e7eb">
      <tr style="color:#8b93a1;text-align:left"><th style="padding:6px 8px">Employee</th><th style="padding:6px 8px">Status</th><th style="padding:6px 8px">In</th><th style="padding:6px 8px">Out</th><th style="padding:6px 8px">Worked</th></tr>
      ${rows}
    </table>
    <a href="${SITE}/attendance/report?date=${report.date}" style="display:inline-block;margin-top:18px;background:#5aa02c;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px">Open report</a>
  </div></body></html>`
}

/** Runs twice a day: "morning" flags staff who have not checked in; "evening" sends the daily report. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const run = req.nextUrl.searchParams.get("run") === "evening" ? "evening" : "morning"
  const svc = createServiceClient()
  const date = localDate()
  const report = await buildDailyReport(svc, date)
  if (report.isOffDay) return NextResponse.json({ ok: true, skipped: "off_day" })

  const link = `/attendance/report?date=${date}`
  const managers = await attendanceManagerIds()
  const notIn = report.rows.filter((r) => r.status === "not_in")

  if (run === "morning") {
    if (notIn.length) {
      await notifyUsers(
        notIn.map((r) => r.userId),
        { title: "You haven't checked in today", body: `Your shift started at ${report.settings.shift_start}. Check in from the Attendance page.`, type: "warning", link: "/attendance" },
      )
      await notifyUsers(managers, {
        title: `${notIn.length} staff not checked in yet`,
        body: names(notIn),
        type: "warning",
        link,
      })
    }
    return NextResponse.json({ ok: true, run, notCheckedIn: notIn.length })
  }

  const stillIn = report.rows.filter((r) => r.missingCheckout)
  if (stillIn.length) {
    await notifyUsers(
      stillIn.map((r) => r.userId),
      { title: "Don't forget to check out", body: "You are still checked in. Check out from the Attendance page before you leave.", type: "warning", link: "/attendance" },
    )
  }
  const c = report.counts
  await notifyUsers(managers, {
    title: `Daily attendance report · ${date}`,
    body: `${c.present} present, ${c.late} late, ${c.absent + c.not_in} absent, ${c.leave + c.sick} leave, ${c.missingCheckout} not checked out`,
    type: c.absent + c.not_in + c.late > 0 ? "warning" : "info",
    link,
  })

  const { data: owners } = await svc.from("profiles").select("email").eq("role", "owner").eq("is_active", true)
  const html = reportEmail(report)
  for (const o of owners ?? []) {
    if (!o.email) continue
    await sendEmail({
      to: o.email,
      subject: `Daily attendance · ${date} · ${c.present}/${c.total} present`,
      html,
      idempotencyKey: `attendance-report-${date}-${o.email}`,
    })
  }
  return NextResponse.json({ ok: true, run, counts: c })
}
