"use client"

import {
  formatDuration,
  formatTime,
  lateMinutesFor,
  workedMinutes,
  type AttendanceRecord,
  type AttendanceSettings,
  type EmployeeSummary,
  type PayrollLine,
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

const aed = (n: number) => n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function buildPayrollPdf(opts: {
  company: Company
  month: string
  settings: AttendanceSettings
  payroll: PayrollLine[]
}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const basis =
    opts.settings.payroll_day_basis === "30" ? "30 days" : opts.settings.payroll_day_basis === "calendar" ? "days in month" : "working days"

  const cols: Col[] = [
    { label: "Employee", w: 52 },
    { label: "Role", w: 34 },
    { label: "Salary", w: 24, right: true },
    { label: "Daily rate", w: 22, right: true },
    { label: "Absent", w: 16, right: true },
    { label: "Absence ded.", w: 26, right: true },
    { label: "Late", w: 18, right: true },
    { label: "Late ded.", w: 22, right: true },
    { label: "Total ded.", w: 26, right: true },
    { label: "Net pay", w: 33, right: true },
  ]

  let y = 0
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
    doc.text(`Payroll Deductions — ${monthLabel(opts.month)}`, W - M, 13, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    doc.text(
      `Daily rate = salary ÷ ${basis} · ${opts.settings.absence_deduction_days} day(s) per absence · Late deduction ${opts.settings.late_deduction_enabled ? "on" : "off"} · Absences counted from ${opts.settings.attendance_start_date}`,
      W - M,
      18,
      { align: "right" },
    )
    y = 26
    doc.setFillColor(244, 244, 244)
    doc.rect(M, y, W - 2 * M, 6, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    let x = M + 2
    for (const c of cols) {
      doc.text(c.label, c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
      x += c.w
    }
    y += 6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
  }

  const row = (cells: string[], bold = false) => {
    if (y > H - 30) {
      doc.addPage()
      header()
    }
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setTextColor(...INK)
    let x = M + 2
    cells.forEach((cell, i) => {
      const c = cols[i]
      doc.text(doc.splitTextToSize(cell, c.w - 3)[0] ?? "", c.right ? x + c.w - 4 : x, y + 4, { align: c.right ? "right" : "left" })
      x += c.w
    })
    doc.setDrawColor(...LINE)
    doc.line(M, y + 6, W - M, y + 6)
    y += 6
  }

  header()
  const t = { salary: 0, abs: 0, late: 0, ded: 0, net: 0 }
  for (const p of opts.payroll) {
    t.salary += p.salary
    t.abs += p.absenceDeduction
    t.late += p.lateDeduction
    t.ded += p.totalDeduction
    t.net += p.net
    row([
      p.name,
      roleLabel(p.role),
      aed(p.salary),
      aed(p.dailyRate),
      String(p.absentDays),
      aed(p.absenceDeduction),
      formatDuration(p.lateMinutes),
      aed(p.lateDeduction),
      aed(p.totalDeduction),
      aed(p.net),
    ])
  }
  row(["Total (AED)", "", aed(t.salary), "", "", aed(t.abs), "", aed(t.late), aed(t.ded), aed(t.net)], true)

  y += 16
  doc.setDrawColor(...GREY)
  doc.setFontSize(8)
  doc.setTextColor(...GREY)
  for (const [i, label] of ["Prepared by", "Approved by"].entries()) {
    const x = M + i * 90
    doc.line(x, y, x + 70, y)
    doc.text(label, x, y + 4)
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...GREY)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 6, { align: "right" })
    doc.text(`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} (GST)`, M, H - 6)
  }
  doc.save(`payroll-${opts.month}.pdf`)
}

export function downloadPayrollCsv(month: string, payroll: PayrollLine[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ["Employee", "Role", "Monthly salary", "Basis days", "Daily rate", "Absent days", "Absence deduction", "Late (min)", "Late deduction", "Missing check-outs", "Total deduction", "Net pay"]
  const lines = payroll.map((p) =>
    [p.name, roleLabel(p.role), p.salary.toFixed(2), p.basisDays, p.dailyRate.toFixed(2), p.absentDays, p.absenceDeduction.toFixed(2), Math.round(p.lateMinutes), p.lateDeduction.toFixed(2), p.missingCheckout, p.totalDeduction.toFixed(2), p.net.toFixed(2)]
      .map(esc)
      .join(","),
  )
  const blob = new Blob(["\uFEFF" + [head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `payroll-${month}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
