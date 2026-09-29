"use client"

import {
  formatDuration,
  formatTime,
  lateMinutesFor,
  workedMinutes,
  type AttendanceRecord,
  type AttendanceSettings,
  type EmployeeSummary,
  type StaffMember,
} from "@/lib/attendance"
import { roleLabel } from "@/lib/rbac/roles"

type Company = { name: string; trn: string | null; address: string | null }
type Col = { label: string; w: number; right?: boolean }

const GREEN: [number, number, number] = [95, 214, 34]
const INK: [number, number, number] = [23, 23, 23]
const GREY: [number, number, number] = [110, 110, 110]
const LINE: [number, number, number] = [215, 215, 215]

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
}

export async function buildAttendancePdf(opts: {
  company: Company
  month: string
  settings: AttendanceSettings
  summaries: EmployeeSummary[]
  records: AttendanceRecord[]
  staff: StaffMember[]
}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  let y = M

  const header = () => {
    doc.setFillColor(...GREEN)
    doc.rect(0, 0, W, 3, "F")
    doc.setTextColor(...INK)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text(opts.company.name || "Company", M, 13)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    const sub = [opts.company.trn ? `TRN ${opts.company.trn}` : null, opts.company.address].filter(Boolean).join("  ·  ")
    if (sub) doc.text(sub, M, 18)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(...INK)
    doc.text(`Attendance Report — ${monthLabel(opts.month)}`, W - M, 13, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    doc.text(
      `Shift ${opts.settings.shift_start}–${opts.settings.shift_end} · Grace ${opts.settings.attendance_grace_minutes} min · Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}`,
      W - M,
      18,
      { align: "right" },
    )
    y = 26
  }

  const footer = () => {
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(...GREY)
      doc.text(`Page ${i} of ${pages}`, W - M, H - 6, { align: "right" })
      doc.text("Times in Gulf Standard Time (UTC+4). Manual entries are marked with *.", M, H - 6)
    }
  }

  const table = (title: string, cols: Col[], rows: string[][]) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(title, M, y)
    y += 4
    const drawHead = () => {
      doc.setFillColor(244, 244, 244)
      doc.rect(M, y, W - 2 * M, 6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.5)
      doc.setTextColor(...GREY)
      let x = M + 2
      for (const c of cols) {
        doc.text(c.label, c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
        x += c.w
      }
      y += 6
    }
    drawHead()
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    for (const r of rows) {
      if (y > H - 14) {
        doc.addPage()
        header()
        drawHead()
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
      }
      doc.setTextColor(...INK)
      let x = M + 2
      r.forEach((cell, i) => {
        const c = cols[i]
        const txt = doc.splitTextToSize(cell, c.w - 3)[0] ?? ""
        doc.text(txt, c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
        x += c.w
      })
      doc.setDrawColor(...LINE)
      doc.line(M, y + 6, W - M, y + 6)
      y += 6
    }
    y += 6
  }

  header()

  const tot = opts.summaries.reduce(
    (a, s) => ({
      present: a.present + s.present,
      late: a.late + s.late,
      absent: a.absent + s.absent,
      worked: a.worked + s.workedMinutes,
      ot: a.ot + s.overtimeMinutes,
    }),
    { present: 0, late: 0, absent: 0, worked: 0, ot: 0 },
  )

  table(
    "Employee summary",
    [
      { label: "Employee", w: 58 },
      { label: "Role", w: 38 },
      { label: "Present", w: 18, right: true },
      { label: "Late", w: 16, right: true },
      { label: "Late time", w: 22, right: true },
      { label: "Absent", w: 18, right: true },
      { label: "Leave", w: 16, right: true },
      { label: "Sick", w: 14, right: true },
      { label: "No check-out", w: 24, right: true },
      { label: "Hours worked", w: 26, right: true },
      { label: "Overtime", w: 23, right: true },
    ],
    [
      ...opts.summaries.map((s) => [
        s.name,
        roleLabel(s.role),
        String(s.present),
        String(s.late),
        formatDuration(s.lateMinutes),
        String(s.absent),
        String(s.leave),
        String(s.sick),
        String(s.missingCheckout),
        formatDuration(s.workedMinutes),
        formatDuration(s.overtimeMinutes),
      ]),
      ["TOTAL", "", String(tot.present), String(tot.late), "", String(tot.absent), "", "", "", formatDuration(tot.worked), formatDuration(tot.ot)],
    ],
  )

  const names = new Map(opts.staff.map((s) => [s.id, s.full_name || "Unnamed"]))
  const daily = [...opts.records].sort((a, b) =>
    a.work_date === b.work_date
      ? (names.get(a.user_id) ?? "").localeCompare(names.get(b.user_id) ?? "")
      : a.work_date.localeCompare(b.work_date),
  )

  doc.addPage()
  header()
  table(
    "Daily log",
    [
      { label: "Date", w: 26 },
      { label: "Employee", w: 58 },
      { label: "Status", w: 22 },
      { label: "Check in", w: 22 },
      { label: "Check out", w: 22 },
      { label: "Break", w: 18, right: true },
      { label: "Worked", w: 24, right: true },
      { label: "Late", w: 18, right: true },
      { label: "Note / correction reason", w: 63 },
    ],
    daily.map((r) => {
      const manual = r.source === "manual" ? "*" : ""
      return [
        r.work_date,
        names.get(r.user_id) ?? "—",
        r.status,
        formatTime(r.check_in_at) + manual,
        formatTime(r.check_out_at) + manual,
        r.break_minutes ? `${r.break_minutes}m` : "",
        r.check_in_at && r.check_out_at ? formatDuration(workedMinutes(r)) : r.check_in_at ? "open" : "",
        lateMinutesFor(r.check_in_at, opts.settings) ? `${lateMinutesFor(r.check_in_at, opts.settings)}m` : "",
        r.edit_reason || [r.check_in_note, r.check_out_note].filter(Boolean).join(" / "),
      ]
    }),
  )

  footer()
  doc.save(`attendance-${opts.month}.pdf`)
}

export function downloadAttendanceCsv(month: string, records: AttendanceRecord[], staff: StaffMember[], settings: AttendanceSettings) {
  const names = new Map(staff.map((s) => [s.id, s.full_name || "Unnamed"]))
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ["Date", "Employee", "Status", "Check in", "Check out", "Break (min)", "Worked (min)", "Late (min)", "Source", "In distance (m)", "Out distance (m)", "Reason / notes"]
  const lines = [...records]
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((r) =>
      [
        r.work_date,
        names.get(r.user_id) ?? r.user_id,
        r.status,
        formatTime(r.check_in_at),
        formatTime(r.check_out_at),
        r.break_minutes,
        r.check_out_at ? Math.round(workedMinutes(r)) : "",
        lateMinutesFor(r.check_in_at, settings),
        r.source,
        r.check_in_distance_m ?? "",
        r.check_out_distance_m ?? "",
        r.edit_reason || [r.check_in_note, r.check_out_note].filter(Boolean).join(" / "),
      ]
        .map(esc)
        .join(","),
    )
  const blob = new Blob(["\uFEFF" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `attendance-${month}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
