"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Printer, RotateCcw, Trash2 } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { Button, Card, Field, Input, Select, Badge } from "@/components/ui"
import { PAYMENT_METHODS } from "@/lib/expense-categories"
import { recordSalaryPayment, deleteSalaryPayment } from "@/lib/actions-business-expenses"

import {
  r2,
  absenceDeduction,
  statementFor,
  type PayrollRules,
  type SalaryStaff,
  type StaffAttendance,
  type TargetLine,
} from "@/lib/salary-statement"

export type { SalaryPayment, StaffAttendance, SalaryStaff, PayrollRules } from "@/lib/salary-statement"

const TEXT = {
  en: {
    conclusion: "Salary conclusion",
    conclusionHint: "Unpaid staff show an estimate from their contract salary and this month's attendance. Paid staff show the saved figures.",
    earnings: "Earnings",
    deductionsTitle: "Deductions",
    base: "Basic salary",
    allowances: "Allowances",
    overtime: "Overtime pay",
    commission: "Commission",
    kind: { purchase: "Purchase target", sales: "Sales target", technician: "Technician target" },
    achievedOf: "{a} of {t} ({p}%)",
    commissionRule: "{c}% on amount above target",
    toGo: "AED {n} to go",
    comebackCut: "Invoiced {g} · {n} comeback(s) cut",
    passed: "Target passed",
    noTarget: "No target set",
    gross: "Gross",
    absence: "Absence",
    late: "Late arrival",
    other: "Other deductions",
    totalDeductions: "Total deductions",
    finalAmount: "Final amount",
    paidSoFar: "Paid",
    stillToPay: "Still to pay",
    paid: "Paid",
    estimate: "Estimate",
    pay: "Pay salary",
    edit: "Edit",
    print: "Print",
    days: "{n} days",
    day: "1 day",
    lateDetail: "{m} min over {d} days",
    attendance: "Attendance",
    present: "Present {n}",
    absentN: "Absent {n}",
    lateN: "Late {n}",
    leaveN: "Leave {n}",
    otHours: "Overtime {h}",
    noAttendance: "Not tracked by attendance",
    absentDays: "Absent days",
    lateMinutes: "Late minutes",
    autoCalc: "Calculated from basic ÷ {d} days",
    recalc: "Reset from attendance",
    paidOn: "Paid on",
    method: "Paid by",
    reference: "Reference",
    note: "Note",
    savePay: "Save payment",
    saving: "Saving…",
    cancel: "Cancel",
    delete: "Delete",
    confirmDelete: "Delete this salary payment? This cannot be undone.",
    readOnly: "You can view salaries but do not have permission to pay them.",
    noStaff: "No active staff.",
    employees: "{n} staff",
  },
  ar: {
    conclusion: "خلاصة الرواتب",
    conclusionHint: "الموظفون غير المدفوعين يظهر لهم تقدير من الراتب التعاقدي وحضور هذا الشهر. المدفوعون تظهر أرقامهم المحفوظة.",
    earnings: "المستحقات",
    deductionsTitle: "الخصومات",
    base: "الراتب الأساسي",
    allowances: "البدلات",
    overtime: "أجر العمل الإضافي",
    commission: "العمولة",
    kind: { purchase: "هدف المشتريات", sales: "هدف المبيعات", technician: "هدف الفني" },
    achievedOf: "{a} من {t} ({p}%)",
    commissionRule: "{c}% على المبلغ فوق الهدف",
    toGo: "متبقي {n} درهم",
    comebackCut: "المفوتر {g} · خصم {n} سيارة راجعة",
    passed: "تم تجاوز الهدف",
    noTarget: "لا يوجد هدف",
    gross: "الإجمالي",
    absence: "الغياب",
    late: "التأخير",
    other: "خصومات أخرى",
    totalDeductions: "إجمالي الخصومات",
    finalAmount: "المبلغ النهائي",
    paidSoFar: "مدفوع",
    stillToPay: "متبقي للدفع",
    paid: "مدفوع",
    estimate: "تقديري",
    pay: "دفع الراتب",
    edit: "تعديل",
    print: "طباعة",
    days: "{n} أيام",
    day: "يوم واحد",
    lateDetail: "{m} دقيقة خلال {d} أيام",
    attendance: "الحضور",
    present: "حضور {n}",
    absentN: "غياب {n}",
    lateN: "تأخير {n}",
    leaveN: "إجازة {n}",
    otHours: "إضافي {h}",
    noAttendance: "غير مشمول بالحضور",
    absentDays: "أيام الغياب",
    lateMinutes: "دقائق التأخير",
    autoCalc: "محسوب من الأساسي ÷ {d} يوم",
    recalc: "إعادة من الحضور",
    paidOn: "تاريخ الدفع",
    method: "طريقة الدفع",
    reference: "المرجع",
    note: "ملاحظة",
    savePay: "حفظ الدفعة",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    delete: "حذف",
    confirmDelete: "حذف دفعة الراتب هذه؟ لا يمكن التراجع.",
    readOnly: "يمكنك عرض الرواتب لكن لا تملك صلاحية الدفع.",
    noStaff: "لا يوجد موظفون نشطون.",
    employees: "{n} موظف",
  },
}

type T = (typeof TEXT)["en"]
type Lang = "en" | "ar"

const fmt = (n: number, L: Lang) =>
  new Intl.NumberFormat(L === "ar" ? "ar-AE" : "en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`

export function SalaryConclusion({
  month,
  staff,
  rules,
  canEdit,
}: {
  month: string
  staff: SalaryStaff[]
  rules: PayrollRules
  canEdit: boolean
}) {
  const { lang } = useI18n()
  const L: Lang = lang === "ar" ? "ar" : "en"
  const t = TEXT[L]
  const [editing, setEditing] = React.useState<string | null>(null)

  const rows = staff.map((s) => ({ s, st: statementFor(s, rules) }))
  const tot = rows.reduce(
    (a, { st }) => ({
      base: a.base + st.base,
      allowances: a.allowances + st.allowances,
      overtime: a.overtime + st.overtime,
      commission: a.commission + st.commission,
      gross: a.gross + st.gross,
      absence: a.absence + st.absence,
      late: a.late + st.late,
      other: a.other + st.other,
      deductions: a.deductions + st.deductions,
      final: a.final + st.final,
      paid: a.paid + (st.estimated ? 0 : st.final),
    }),
    { base: 0, allowances: 0, overtime: 0, commission: 0, gross: 0, absence: 0, late: 0, other: 0, deductions: 0, final: 0, paid: 0 },
  )

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(L === "ar" ? "ar-AE" : "en-GB", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex flex-col gap-4">
      {!canEdit ? <p className="text-sm text-muted-foreground">{t.readOnly}</p> : null}

      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">
              {t.conclusion} · {monthLabel}
            </h2>
            <p className="max-w-xl text-pretty text-xs leading-relaxed text-muted-foreground">{t.conclusionHint}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer className="size-4" />
            {t.print}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.earnings}</span>
            <Line label={t.base} value={tot.base} L={L} />
            <Line label={t.allowances} value={tot.allowances} L={L} />
            <Line label={t.overtime} value={tot.overtime} L={L} />
            <Line label={t.commission} value={tot.commission} L={L} />
            <Line label={t.gross} value={tot.gross} L={L} strong />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.deductionsTitle}</span>
            <Line label={t.absence} value={-tot.absence} L={L} />
            <Line label={t.late} value={-tot.late} L={L} />
            <Line label={t.other} value={-tot.other} L={L} />
            <Line label={t.totalDeductions} value={-tot.deductions} L={L} strong />
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t.finalAmount} · {t.employees.replace("{n}", String(staff.length))}
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-primary">AED {fmt(tot.final, L)}</span>
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <Line label={t.paidSoFar} value={tot.paid} L={L} />
              <Line label={t.stillToPay} value={r2(tot.final - tot.paid)} L={L} />
            </div>
          </div>
        </div>
      </Card>

      {staff.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{t.noStaff}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ s, st }) => (
            <li key={s.userId}>
              <Card className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[s.employeeId, s.title || s.role].filter(Boolean).join(" · ")}
                    </span>
                    <AttendanceChips a={s.attendance} t={t} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                        AED {fmt(st.final, L)}
                      </span>
                      {s.payment ? (
                        <Badge className="bg-primary/15 text-primary">
                          {t.paid} · {s.payment.paidOn}
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">{t.estimate}</Badge>
                      )}
                    </div>
                    {canEdit && editing !== s.userId ? (
                      <Button
                        variant={s.payment ? "ghost" : "primary"}
                        size="sm"
                        onClick={() => setEditing(s.userId)}
                        className="print:hidden"
                      >
                        {s.payment ? t.edit : t.pay}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {editing === s.userId ? (
                  <SalaryForm month={month} s={s} rules={rules} onDone={() => setEditing(null)} t={t} L={L} />
                ) : (
                  <div className="grid gap-4 border-t border-border pt-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Line label={t.base} value={st.base} L={L} />
                      <Line label={t.allowances} value={st.allowances} L={L} />
                      <Line label={t.overtime} value={st.overtime} L={L} />
                      <Line label={t.commission} value={st.commission} L={L} />
                      <TargetDetail targets={s.targets} t={t} L={L} />
                      <Line label={t.gross} value={st.gross} L={L} strong />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Line
                        label={t.absence}
                        detail={st.absentDays ? (st.absentDays === 1 ? t.day : t.days.replace("{n}", String(st.absentDays))) : undefined}
                        value={-st.absence}
                        L={L}
                      />
                      <Line
                        label={t.late}
                        detail={
                          st.lateMinutes
                            ? t.lateDetail
                                .replace("{m}", String(st.lateMinutes))
                                .replace("{d}", String(s.attendance?.lateDays ?? "–"))
                            : undefined
                        }
                        value={-st.late}
                        L={L}
                      />
                      <Line label={t.other} value={-st.other} L={L} />
                      <Line label={t.finalAmount} value={st.final} L={L} strong accent />
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Line({
  label,
  detail,
  value,
  L,
  strong,
  accent,
}: {
  label: string
  detail?: string
  value: number
  L: Lang
  strong?: boolean
  accent?: boolean
}) {
  const negative = value < 0
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-sm ${strong ? "border-t border-border pt-1.5 font-semibold" : ""}`}
    >
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {detail ? <span className="ms-1.5 text-xs text-muted-foreground">({detail})</span> : null}
      </span>
      <span
        className={`font-mono tabular-nums ${
          accent ? "text-primary" : negative && value !== 0 ? "text-destructive" : "text-foreground"
        }`}
      >
        {negative && value !== 0 ? "−" : ""}
        {fmt(Math.abs(value), L)}
      </span>
    </div>
  )
}

function TargetDetail({ targets, t, L }: { targets?: TargetLine[]; t: T; L: Lang }) {
  if (!targets?.length) return <span className="text-xs text-muted-foreground">{t.noTarget}</span>
  const whole = (n: number) => new Intl.NumberFormat(L === "ar" ? "ar-AE" : "en-AE", { maximumFractionDigits: 0 }).format(n)
  return (
    <ul className="flex flex-col gap-1.5 rounded-md bg-muted/50 px-2.5 py-2">
      {targets.map((x) => {
        const pct = x.target > 0 ? Math.min(100, Math.round((x.achieved / x.target) * 100)) : 0
        const passed = x.achieved > x.target
        return (
          <li key={x.kind} className="flex flex-col gap-1 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{t.kind[x.kind]}</span>
              <span className={passed ? "font-medium text-primary" : "text-muted-foreground"}>
                {passed ? t.passed : t.toGo.replace("{n}", whole(x.target - x.achieved))}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.kind[x.kind]}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-muted-foreground">
              <span className="font-mono tabular-nums">
                {t.achievedOf
                  .replace("{a}", whole(x.achieved))
                  .replace("{t}", whole(x.target))
                  .replace("{p}", String(Math.round((x.achieved / Math.max(1, x.target)) * 100)))}
              </span>
              <span>{t.commissionRule.replace("{c}", String(x.percent))}</span>
            </div>
            {x.comebackDeduction ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-muted-foreground">
                <span>
                  {t.comebackCut
                    .replace("{g}", whole(x.gross ?? x.achieved))
                    .replace("{n}", String(x.comebacks ?? 0))}
                </span>
                <span className="font-mono tabular-nums text-destructive">−{whole(x.comebackDeduction)}</span>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function AttendanceChips({ a, t }: { a?: StaffAttendance | null; t: T }) {
  if (!a) return <span className="mt-1 text-xs text-muted-foreground">{t.noAttendance}</span>
  const chips = [
    { k: "p", label: t.present.replace("{n}", String(a.present)), tone: "text-muted-foreground" },
    { k: "a", label: t.absentN.replace("{n}", String(a.absentDays)), tone: a.absentDays ? "text-destructive" : "text-muted-foreground" },
    { k: "l", label: t.lateN.replace("{n}", String(a.lateDays)), tone: a.lateDays ? "text-chart-4" : "text-muted-foreground" },
    { k: "v", label: t.leaveN.replace("{n}", String(a.leaveDays)), tone: "text-muted-foreground" },
    { k: "o", label: t.otHours.replace("{h}", hours(a.overtimeMinutes)), tone: "text-muted-foreground" },
  ]
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t.attendance}>
      {chips.map((c) => (
        <li key={c.k} className={`rounded-md border border-border px-2 py-0.5 text-xs ${c.tone}`}>
          {c.label}
        </li>
      ))}
    </ul>
  )
}

function SalaryForm({
  month,
  s,
  rules,
  onDone,
  t,
  L,
}: {
  month: string
  s: SalaryStaff
  rules: PayrollRules
  onDone: () => void
  t: T
  L: Lang
}) {
  const router = useRouter()
  const p = s.payment
  const est = statementFor({ ...s, payment: null }, rules)
  const [vals, setVals] = React.useState({
    base: p?.base ?? est.base,
    allowances: p?.allowances ?? s.suggestedAllowances,
    overtime: p?.overtime ?? 0,
    commission: p?.commission ?? est.commission,
    absentDays: p?.absentDays ?? s.attendance?.absentDays ?? 0,
    lateMinutes: p?.lateMinutes ?? s.attendance?.lateMinutes ?? 0,
    lateDeduction: p?.lateDeduction ?? est.late,
    otherDeductions: p?.otherDeductions ?? 0,
  })
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const d = { absence: absenceDeduction(s.suggestedBase || vals.base, vals.absentDays, rules), late: vals.lateDeduction }
  const gross = r2(vals.base + vals.allowances + vals.overtime + vals.commission)
  const deductions = r2(d.absence + d.late + vals.otherDeductions)
  const net = r2(gross - deductions)

  const num = (k: keyof typeof vals, name: string, step = "0.01") => ({
    name,
    type: "number",
    inputMode: "decimal" as const,
    min: "0",
    step,
    value: String(vals[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: Number(e.target.value) || 0 })),
  })

  const resetFromAttendance = () =>
    setVals((v) => ({
      ...v,
      base: est.base,
      commission: est.commission,
      absentDays: s.attendance?.absentDays ?? 0,
      lateMinutes: s.attendance?.lateMinutes ?? 0,
      lateDeduction: est.late,
    }))

  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    fd.set("absence_deduction", String(d.absence))
    fd.set("late_deduction", String(d.late))
    setError(null)
    startTransition(async () => {
      const res = await recordSalaryPayment(fd)
      if (!res.ok) setError(res.error)
      else {
        router.refresh()
        onDone()
      }
    })
  }

  const remove = () => {
    if (!p || !confirm(t.confirmDelete)) return
    startTransition(async () => {
      const res = await deleteSalaryPayment(p.id)
      if (!res.ok) setError(res.error)
      else {
        router.refresh()
        onDone()
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-t border-border pt-4">
      <input type="hidden" name="user_id" value={s.userId} />
      <input type="hidden" name="period_month" value={month} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.earnings}</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t.base}>
            <Input {...num("base", "base_salary")} required />
          </Field>
          <Field label={t.allowances}>
            <Input {...num("allowances", "allowances")} />
          </Field>
          <Field label={t.overtime}>
            <Input {...num("overtime", "overtime")} />
          </Field>
          <Field label={t.commission}>
            <Input {...num("commission", "commission")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.deductionsTitle}</legend>
          {s.attendance ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetFromAttendance}>
              <RotateCcw className="size-4" />
              {t.recalc}
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t.absentDays}>
            <Input {...num("absentDays", "absent_days", "0.5")} max="31" />
          </Field>
          <Field label={t.lateMinutes}>
            <Input {...num("lateMinutes", "late_minutes", "1")} />
          </Field>
          <Field label={t.late}>
            <Input {...num("lateDeduction", "late_fee_input")} />
          </Field>
          <Field label={t.other}>
            <Input {...num("otherDeductions", "other_deductions")} />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-3">
          <Line label={t.absence} value={-d.absence} L={L} />
          <Line label={t.late} value={-d.late} L={L} />
          <span className="text-xs text-muted-foreground">{t.autoCalc.replace("{d}", String(rules.basisDays))}</span>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label={t.paidOn}>
          <Input name="paid_on" type="date" defaultValue={p?.paidOn ?? new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label={t.method}>
          <Select name="payment_method" defaultValue={p?.method ?? "bank_transfer"}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {L === "ar" ? m.labelAr : m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.reference}>
          <Input name="reference" defaultValue={p?.reference ?? ""} maxLength={100} />
        </Field>
        <Field label={t.note}>
          <Input name="note" maxLength={300} />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
        <Line label={t.gross} value={gross} L={L} />
        <Line label={t.totalDeductions} value={-deductions} L={L} />
        <Line label={t.finalAmount} value={net} L={L} strong accent={net >= 0} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {p ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
            <Trash2 className="size-4" />
            {t.delete}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={pending || net < 0}>
          {pending ? t.saving : t.savePay}
        </Button>
      </div>
    </form>
  )
}
