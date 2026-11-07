"use client"

import { useRouter } from "next/navigation"
import { Printer } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { Button, Card, Badge, Input } from "@/components/ui"
import type { SalaryPayment, StaffAttendance, Statement, TargetKind, TargetLine } from "@/lib/salary-statement"

export type MyTarget = TargetLine

export interface MyPayslip {
  month: string
  commission: number
  deductions: number
  net: number
  paidOn: string
}

const TEXT = {
  en: {
    title: "My Pay & Target",
    subtitle: "Your own target, salary and deductions. Only you and payroll can see this.",
    month: "Month",
    print: "Print",
    targets: "My targets",
    noTargets: "No target has been set for you yet. Your manager sets it in Staff Targets.",
    kind: { purchase: "Purchases", sales: "Sales", technician: "Workshop work" } as Record<TargetKind, string>,
    achieved: "Achieved",
    target: "Target",
    remaining: "Remaining",
    reached: "Target reached",
    invoices: "{n} invoices",
    commissionRule: "{p}% commission on everything above the target",
    commissionEarned: "Commission earned",
    noCommission: "No commission set for this target",
    prorated: "{d} of {n} days (started {s})",
    salary: "My salary",
    paid: "Paid",
    estimate: "Estimate",
    estimateHint: "Not paid yet. This is an estimate from your contract salary, start date, attendance and target commission so far.",
    paidHint: "Paid on {d} by {m}.",
    earnings: "Earnings",
    deductionsTitle: "Deductions",
    base: "Basic salary",
    allowances: "Allowances",
    overtime: "Overtime pay",
    commission: "Commission",
    gross: "Gross",
    absence: "Absence",
    late: "Late arrival",
    other: "Other deductions",
    totalDeductions: "Total deductions",
    finalAmount: "Final amount",
    days: "{n} days",
    minutes: "{n} min",
    attendance: "Attendance this month",
    present: "Present",
    absent: "Absent",
    lateDays: "Late",
    leave: "Leave",
    overtimeH: "Overtime",
    noAttendance: "Your role is not tracked by attendance.",
    history: "Past payslips",
    noHistory: "No salary payments recorded yet.",
    net: "Net",
  },
  ar: {
    title: "راتبي وهدفي",
    subtitle: "هدفك وراتبك وخصوماتك. لا يراها إلا أنت وقسم الرواتب.",
    month: "الشهر",
    print: "طباعة",
    targets: "أهدافي",
    noTargets: "لم يحدد لك هدف بعد. يحدده المدير من صفحة أهداف الموظفين.",
    kind: { purchase: "المشتريات", sales: "المبيعات", technician: "أعمال الورشة" } as Record<TargetKind, string>,
    achieved: "المحقق",
    target: "الهدف",
    remaining: "المتبقي",
    reached: "تم تحقيق الهدف",
    invoices: "{n} فاتورة",
    commissionRule: "عمولة {p}% على كل ما يزيد عن الهدف",
    commissionEarned: "العمولة المستحقة",
    noCommission: "لا توجد عمولة لهذا الهدف",
    prorated: "{d} من {n} يوم (بدأ {s})",
    salary: "راتبي",
    paid: "مدفوع",
    estimate: "تقديري",
    estimateHint: "لم يدفع بعد. هذا تقدير من راتبك التعاقدي وتاريخ بدايتك وحضورك وعمولة الهدف حتى الآن.",
    paidHint: "دفع بتاريخ {d} عن طريق {m}.",
    earnings: "المستحقات",
    deductionsTitle: "الخصومات",
    base: "الراتب الأساسي",
    allowances: "البدلات",
    overtime: "أجر العمل الإضافي",
    commission: "العمولة",
    gross: "الإجمالي",
    absence: "الغياب",
    late: "التأخير",
    other: "خصومات أخرى",
    totalDeductions: "إجمالي الخصومات",
    finalAmount: "المبلغ النهائي",
    days: "{n} أيام",
    minutes: "{n} دقيقة",
    attendance: "الحضور هذا الشهر",
    present: "حضور",
    absent: "غياب",
    lateDays: "تأخير",
    leave: "إجازة",
    overtimeH: "إضافي",
    noAttendance: "دورك غير مشمول بالحضور.",
    history: "كشوف الرواتب السابقة",
    noHistory: "لا توجد رواتب مسجلة بعد.",
    net: "الصافي",
  },
}

type Lang = "en" | "ar"

const money = (n: number, L: Lang) =>
  `AED ${new Intl.NumberFormat(L === "ar" ? "ar-AE" : "en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`
const monthName = (m: string, L: Lang) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString(L === "ar" ? "ar-AE" : "en-GB", { month: "long", year: "numeric" })

export function MyPayView({
  month,
  name,
  title,
  employeeId,
  statement: st,
  attendance,
  payment,
  targets,
  history,
  startDate,
}: {
  startDate?: string | null
  month: string
  name: string
  title: string
  employeeId: string
  statement: Statement
  attendance: StaffAttendance | null
  payment: SalaryPayment | null
  targets: MyTarget[]
  history: MyPayslip[]
}) {
  const router = useRouter()
  const { lang } = useI18n()
  const L: Lang = lang === "ar" ? "ar" : "en"
  const t = TEXT[L]

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-balance text-xl font-semibold text-foreground">{t.title}</h1>
          <p className="text-sm text-muted-foreground">
            {name}
            {title ? ` · ${title}` : ""}
            {employeeId ? ` · #${employeeId}` : ""}
          </p>
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <label htmlFor="my-month" className="sr-only">
            {t.month}
          </label>
          <Input
            id="my-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && router.push(`/me?m=${e.target.value}`)}
            className="w-40"
          />
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            {t.print}
          </Button>
        </div>
      </header>

      <section aria-labelledby="my-targets" className="flex flex-col gap-3">
        <h2 id="my-targets" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.targets} · {monthName(month, L)}
        </h2>
        {targets.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">{t.noTargets}</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {targets.map((tg) => {
              const pct = tg.target > 0 ? Math.min(100, Math.round((tg.achieved / tg.target) * 100)) : 0
              const done = tg.achieved >= tg.target
              return (
                <Card key={tg.kind} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{t.kind[tg.kind]}</span>
                    {done ? <Badge className="bg-primary/15 text-primary">{t.reached}</Badge> : null}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-foreground">{pct}%</span>
                    <span className="text-xs text-muted-foreground">{t.invoices.replace("{n}", String(tg.count))}</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t.kind[tg.kind]}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <Stat label={t.achieved} value={money(tg.achieved, L)} />
                    <Stat label={t.target} value={money(tg.target, L)} />
                    <Stat label={t.remaining} value={money(Math.max(0, tg.target - tg.achieved), L)} />
                  </dl>
                  {tg.percent > 0 ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2 text-xs">
                      <span className="text-muted-foreground">{t.commissionRule.replace("{p}", String(tg.percent))}</span>
                      <span className={tg.commission > 0 ? "font-semibold text-primary tabular-nums" : "text-muted-foreground tabular-nums"}>
                        {t.commissionEarned}: {money(tg.commission, L)}
                      </span>
                    </div>
                  ) : (
                    <p className="border-t border-border pt-2 text-xs text-muted-foreground">{t.noCommission}</p>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="my-salary" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 id="my-salary" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.salary} · {monthName(month, L)}
          </h2>
          <Badge className={st.estimated ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}>
            {st.estimated ? t.estimate : t.paid}
          </Badge>
        </div>
        <Card className="flex flex-col gap-4 p-4 md:p-5">
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            {payment ? t.paidHint.replace("{d}", payment.paidOn).replace("{m}", payment.method) : t.estimateHint}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.earnings}</span>
              <Row
                label={t.base}
                hint={
                  startDate && st.daysEmployed < st.daysInMonth
                    ? t.prorated
                        .replace("{d}", String(st.daysEmployed))
                        .replace("{n}", String(st.daysInMonth))
                        .replace("{s}", startDate)
                    : undefined
                }
                value={money(st.base, L)}
              />
              <Row label={t.allowances} value={money(st.allowances, L)} />
              <Row label={t.overtime} value={money(st.overtime, L)} />
              <Row label={t.commission} value={money(st.commission, L)} />
              <Row label={t.gross} value={money(st.gross, L)} strong />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.deductionsTitle}</span>
              <Row
                label={t.absence}
                hint={st.absentDays ? t.days.replace("{n}", String(st.absentDays)) : undefined}
                value={`- ${money(st.absence, L)}`}
                negative={st.absence > 0}
              />
              <Row
                label={t.late}
                hint={st.lateMinutes ? t.minutes.replace("{n}", String(st.lateMinutes)) : undefined}
                value={`- ${money(st.late, L)}`}
                negative={st.late > 0}
              />
              <Row label={t.other} value={`- ${money(st.other, L)}`} negative={st.other > 0} />
              <Row label={t.totalDeductions} value={`- ${money(st.deductions, L)}`} strong negative={st.deductions > 0} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-4 py-3">
            <span className="font-medium text-foreground">{t.finalAmount}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{money(st.final, L)}</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.attendance}</span>
          {attendance ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Stat label={t.present} value={String(attendance.present)} />
              <Stat label={t.absent} value={String(attendance.absentDays)} />
              <Stat label={t.lateDays} value={`${attendance.lateDays} · ${t.minutes.replace("{n}", String(attendance.lateMinutes))}`} />
              <Stat label={t.leave} value={String(attendance.leaveDays)} />
              <Stat label={t.overtimeH} value={hours(attendance.overtimeMinutes)} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noAttendance}</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="my-history" className="flex flex-col gap-3">
        <h2 id="my-history" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.history}
        </h2>
        {history.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">{t.noHistory}</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t.month}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t.commission}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t.totalDeductions}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t.net}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.month}
                    onClick={() => router.push(`/me?m=${h.month}`)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2">
                      <a href={`/me?m=${h.month}`} className="text-foreground hover:underline">
                        {monthName(h.month, L)}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">{money(h.commission, L)}</td>
                    <td className="px-4 py-2 text-end tabular-nums text-destructive">- {money(h.deductions, L)}</td>
                    <td className="px-4 py-2 text-end font-medium tabular-nums text-foreground">{money(h.net, L)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  strong,
  negative,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
  negative?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? "border-t border-border pt-1.5 font-semibold" : ""}`}>
      <span className="text-muted-foreground">
        {label}
        {hint ? <span className="ms-1 text-xs">({hint})</span> : null}
      </span>
      <span className={`tabular-nums ${negative ? "text-destructive" : "text-foreground"}`}>{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
