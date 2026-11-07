export interface SalaryPayment {
  id: string
  base: number
  allowances: number
  overtime: number
  commission: number
  absentDays: number
  absenceDeduction: number
  lateMinutes: number
  lateDeduction: number
  otherDeductions: number
  deductions: number
  net: number
  method: string
  reference: string
  paidOn: string
}

export interface StaffAttendance {
  present: number
  absentDays: number
  lateDays: number
  lateMinutes: number
  leaveDays: number
  overtimeMinutes: number
}

export interface SalaryStaff {
  userId: string
  name: string
  role: string
  title: string
  employeeId: string
  payment: SalaryPayment | null
  suggestedBase: number
  suggestedAllowances: number
  attendance?: StaffAttendance | null
}

export interface PayrollRules {
  basisDays: number
  shiftMinutes: number
  absenceFactor: number
  lateEnabled: boolean
}

export interface Statement {
  base: number
  allowances: number
  overtime: number
  commission: number
  gross: number
  absentDays: number
  absence: number
  lateMinutes: number
  late: number
  other: number
  deductions: number
  final: number
  estimated: boolean
}

export const r2 = (n: number) => Math.round(n * 100) / 100

export function attendanceDeductions(base: number, absentDays: number, lateMinutes: number, rules: PayrollRules) {
  const daily = base / Math.max(1, rules.basisDays)
  return {
    absence: r2(absentDays * rules.absenceFactor * daily),
    late: rules.lateEnabled ? r2((lateMinutes / rules.shiftMinutes) * daily) : 0,
  }
}

// Paid months use the saved payslip; unpaid months are an estimate from contract salary and attendance.
export function statementFor(s: SalaryStaff, rules: PayrollRules): Statement {
  const p = s.payment
  if (p) {
    return {
      base: p.base,
      allowances: p.allowances,
      overtime: p.overtime,
      commission: p.commission,
      gross: r2(p.base + p.allowances + p.overtime + p.commission),
      absentDays: p.absentDays,
      absence: p.absenceDeduction,
      lateMinutes: p.lateMinutes,
      late: p.lateDeduction,
      other: p.otherDeductions,
      deductions: p.deductions,
      final: p.net,
      estimated: false,
    }
  }
  const absentDays = s.attendance?.absentDays ?? 0
  const lateMinutes = s.attendance?.lateMinutes ?? 0
  const d = attendanceDeductions(s.suggestedBase, absentDays, lateMinutes, rules)
  const gross = r2(s.suggestedBase + s.suggestedAllowances)
  const deductions = Math.min(gross, r2(d.absence + d.late))
  return {
    base: s.suggestedBase,
    allowances: s.suggestedAllowances,
    overtime: 0,
    commission: 0,
    gross,
    absentDays,
    absence: d.absence,
    lateMinutes,
    late: d.late,
    other: 0,
    deductions,
    final: r2(gross - deductions),
    estimated: true,
  }
}
