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
  lateFee: number
  leaveDays: number
  overtimeMinutes: number
}

export type TargetKind = "purchase" | "sales" | "technician"

export interface TargetLine {
  kind: TargetKind
  target: number
  /** Net achievement used for the target and commission: gross minus comeback deductions. */
  achieved: number
  count: number
  percent: number
  commission: number
  /** Invoiced work before comeback deductions. */
  gross?: number
  /** Value of original jobs that came back this month and are charged to this person. */
  comebackDeduction?: number
  comebacks?: number
}

export interface SalaryStaff {
  userId: string
  name: string
  role: string
  title: string
  employeeId: string
  payment: SalaryPayment | null
  /** Full monthly contract salary (before proration). */
  suggestedBase: number
  suggestedAllowances: number
  attendance?: StaffAttendance | null
  startDate?: string | null
  daysInMonth?: number
  daysEmployed?: number
  targets?: TargetLine[]
}

export interface PayrollRules {
  basisDays: number
  absenceFactor: number
  lateEnabled: boolean
  lateFeePerHour: number
  lateFeeUnderHalf: number
}

export interface Statement {
  base: number
  fullSalary: number
  daysEmployed: number
  daysInMonth: number
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

/** Commission is paid only once the target is passed, as a percentage of the amount above the target. */
export function targetCommission(target: number, achieved: number, percent: number) {
  return target > 0 && percent > 0 && achieved > target ? r2(((achieved - target) * percent) / 100) : 0
}

export function proratedBase(fullSalary: number, daysEmployed: number, daysInMonth: number) {
  return daysEmployed >= daysInMonth ? fullSalary : r2((fullSalary * Math.max(0, daysEmployed)) / Math.max(1, daysInMonth))
}

export function absenceDeduction(fullSalary: number, absentDays: number, rules: PayrollRules) {
  return r2(absentDays * rules.absenceFactor * (fullSalary / Math.max(1, rules.basisDays)))
}

// Paid months use the saved payslip; unpaid months are an estimate from contract salary, start date, attendance and targets.
export function statementFor(s: SalaryStaff, rules: PayrollRules): Statement {
  const daysInMonth = s.daysInMonth ?? 30
  const daysEmployed = s.daysEmployed ?? daysInMonth
  const p = s.payment
  if (p) {
    return {
      base: p.base,
      fullSalary: s.suggestedBase,
      daysEmployed,
      daysInMonth,
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
  const base = proratedBase(s.suggestedBase, daysEmployed, daysInMonth)
  const commission = r2((s.targets ?? []).reduce((t, x) => t + x.commission, 0))
  const absence = absenceDeduction(s.suggestedBase, absentDays, rules)
  const late = rules.lateEnabled ? r2(s.attendance?.lateFee ?? 0) : 0
  const gross = r2(base + s.suggestedAllowances + commission)
  const deductions = Math.min(gross, r2(absence + late))
  return {
    base,
    fullSalary: s.suggestedBase,
    daysEmployed,
    daysInMonth,
    allowances: s.suggestedAllowances,
    overtime: 0,
    commission,
    gross,
    absentDays,
    absence,
    lateMinutes,
    late,
    other: 0,
    deductions,
    final: r2(gross - deductions),
    estimated: true,
  }
}
