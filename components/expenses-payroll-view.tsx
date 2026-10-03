"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, FileText, Paperclip, Plus, Trash2, X } from "lucide-react"
import { useI18n } from "@/lib/i18n/provider"
import { Button, Card, Field, Input, Select, Badge } from "@/components/ui"
import {
  EXPENSE_CATEGORIES,
  EXPENSE_GROUPS,
  PAYMENT_METHODS,
  expenseCategoryLabel,
} from "@/lib/expense-categories"
import {
  addBusinessExpense,
  deleteBusinessExpense,
  getFinanceReceiptUrl,
  recordSalaryPayment,
  deleteSalaryPayment,
} from "@/lib/actions-business-expenses"

export interface BizExpense {
  id: string
  category: string
  description: string
  vendor: string
  amount: number
  vat: number
  date: string
  billMonth: string | null
  method: string
  reference: string
  hasInvoice: boolean
  receiptPath: string | null
}

export interface StaffPay {
  userId: string
  name: string
  role: string
  title: string
  employeeId: string
  payment: {
    id: string
    base: number
    allowances: number
    overtime: number
    deductions: number
    net: number
    method: string
    reference: string
    paidOn: string
  } | null
  suggestedBase: number
  suggestedAllowances: number
}

const TEXT = {
  en: {
    title: "Expenses & Salaries",
    subtitle: "Record every bill and running cost with its receipt, and pay salaries month by month. Everything here flows into Finance & Audit.",
    backToFinance: "Finance & Audit",
    month: "Month",
    totalSpend: "Running costs",
    vatPaid: "VAT on costs",
    salariesPaid: "Salaries paid",
    totalOut: "Total money out",
    tabExpenses: "Bills & expenses",
    tabSalaries: "Salaries",
    billsChecklist: "Monthly bills checklist",
    billsHint: "Each monthly bill should be recorded once for this month.",
    recorded: "Recorded",
    missing: "Missing",
    addExpense: "Add expense",
    cancel: "Cancel",
    type: "Expense type",
    amount: "Total paid (AED, incl. VAT)",
    vat: "VAT included (AED)",
    date: "Payment date",
    billMonth: "Bill for month",
    vendor: "Paid to",
    vendorPh: "e.g. DEWA, du, Etisalat, ENOC",
    description: "Details",
    descPh: "e.g. Recovery from Al Quoz to workshop – Toyota Camry",
    method: "Paid by",
    reference: "Bill / receipt no.",
    receipt: "Bill or receipt photo / PDF",
    receiptHint: "Photo or PDF, max 10 MB. Required for audit.",
    taxInvoice: "This is a VAT tax invoice",
    save: "Save expense",
    saving: "Saving…",
    noExpenses: "No expenses recorded for this month yet.",
    view: "View",
    delete: "Delete",
    confirmDelete: "Delete this record? This cannot be undone.",
    noReceipt: "No receipt",
    employee: "Employee",
    status: "Status",
    net: "Net paid",
    paid: "Paid",
    unpaid: "Not paid",
    pay: "Pay salary",
    edit: "Edit",
    base: "Basic salary",
    allowances: "Allowances",
    overtime: "Overtime",
    deductions: "Deductions",
    paidOn: "Paid on",
    note: "Note",
    savePay: "Save payment",
    netPreview: "Net salary",
    paidCount: "{paid} of {total} staff paid",
    readOnly: "You can view this page but do not have permission to make changes.",
    total: "Total",
  },
  ar: {
    title: "المصروفات والرواتب",
    subtitle: "سجّل كل فاتورة ومصروف تشغيلي مع إيصاله، وادفع الرواتب شهريًا. كل ما هنا يظهر في المالية والتدقيق.",
    backToFinance: "المالية والتدقيق",
    month: "الشهر",
    totalSpend: "المصروفات التشغيلية",
    vatPaid: "ضريبة على المصروفات",
    salariesPaid: "الرواتب المدفوعة",
    totalOut: "إجمالي المدفوعات",
    tabExpenses: "الفواتير والمصروفات",
    tabSalaries: "الرواتب",
    billsChecklist: "قائمة الفواتير الشهرية",
    billsHint: "يجب تسجيل كل فاتورة شهرية مرة واحدة لهذا الشهر.",
    recorded: "مسجّلة",
    missing: "غير مسجّلة",
    addExpense: "إضافة مصروف",
    cancel: "إلغاء",
    type: "نوع المصروف",
    amount: "المبلغ المدفوع (درهم، شامل الضريبة)",
    vat: "الضريبة المضمّنة (درهم)",
    date: "تاريخ الدفع",
    billMonth: "فاتورة شهر",
    vendor: "مدفوع إلى",
    vendorPh: "مثال: ديوا، دو، اتصالات، اينوك",
    description: "التفاصيل",
    descPh: "مثال: ريكفري من القوز إلى الورشة – تويوتا كامري",
    method: "طريقة الدفع",
    reference: "رقم الفاتورة / الإيصال",
    receipt: "صورة أو PDF للفاتورة",
    receiptHint: "صورة أو PDF، بحد أقصى 10 ميغابايت. مطلوبة للتدقيق.",
    taxInvoice: "هذه فاتورة ضريبية",
    save: "حفظ المصروف",
    saving: "جارٍ الحفظ…",
    noExpenses: "لا توجد مصروفات مسجّلة لهذا الشهر بعد.",
    view: "عرض",
    delete: "حذف",
    confirmDelete: "حذف هذا السجل؟ لا يمكن التراجع.",
    noReceipt: "بدون إيصال",
    employee: "الموظف",
    status: "الحالة",
    net: "الصافي المدفوع",
    paid: "مدفوع",
    unpaid: "غير مدفوع",
    pay: "دفع الراتب",
    edit: "تعديل",
    base: "الراتب الأساسي",
    allowances: "البدلات",
    overtime: "العمل الإضافي",
    deductions: "الخصومات",
    paidOn: "تاريخ الدفع",
    note: "ملاحظة",
    savePay: "حفظ الدفعة",
    netPreview: "صافي الراتب",
    paidCount: "تم الدفع لـ {paid} من {total} موظف",
    readOnly: "يمكنك عرض هذه الصفحة لكن لا تملك صلاحية التعديل.",
    total: "الإجمالي",
  },
}

const aed = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === "ar" ? "ar-AE" : "en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function ExpensesPayrollView({
  month,
  expenses,
  staff,
  canExpenses,
  canPayroll,
}: {
  month: string
  expenses: BizExpense[]
  staff: StaffPay[]
  canExpenses: boolean
  canPayroll: boolean
}) {
  const { lang } = useI18n()
  const L = lang === "ar" ? "ar" : "en"
  const t = TEXT[L]
  const router = useRouter()
  const [tab, setTab] = React.useState<"expenses" | "salaries">("expenses")

  const inMonth = expenses.filter((e) => e.date.startsWith(month))
  const spend = inMonth.reduce((s, e) => s + e.amount, 0)
  const vat = inMonth.reduce((s, e) => s + e.vat, 0)
  const salaries = staff.reduce((s, p) => s + (p.payment?.net ?? 0), 0)
  const paidCount = staff.filter((s) => s.payment).length

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(L === "ar" ? "ar-AE" : "en-GB", {
    month: "long",
    year: "numeric",
  })

  const goMonth = (m: string) => router.push(`/finance/expenses?m=${m}`)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/finance" className="text-xs text-muted-foreground hover:text-foreground">
            {t.backToFinance}
          </Link>
          <h1 className="text-balance text-2xl font-semibold text-foreground">{t.title}</h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2" aria-label={t.month}>
          <Button variant="ghost" size="sm" onClick={() => goMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && goMonth(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground"
            aria-label={t.month}
          />
          <Button variant="ghost" size="sm" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={monthLabel}>
        <Stat label={t.totalSpend} value={aed(spend, L)} />
        <Stat label={t.vatPaid} value={aed(vat, L)} />
        <Stat label={t.salariesPaid} value={aed(salaries, L)} sub={t.paidCount.replace("{paid}", String(paidCount)).replace("{total}", String(staff.length))} />
        <Stat label={t.totalOut} value={aed(spend + salaries, L)} strong />
      </section>

      <div role="tablist" className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 self-start">
        {(["expenses", "salaries"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "expenses" ? t.tabExpenses : t.tabSalaries}
          </button>
        ))}
      </div>

      {tab === "expenses" ? (
        <ExpensesTab month={month} expenses={expenses} inMonth={inMonth} canEdit={canExpenses} t={t} L={L} />
      ) : (
        <SalariesTab month={month} staff={staff} canEdit={canPayroll} t={t} L={L} />
      )}
    </div>
  )
}

type T = (typeof TEXT)["en"]

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-lg tabular-nums ${strong ? "text-primary" : "text-foreground"}`}>
        <span className="text-xs text-muted-foreground">AED </span>
        {value}
      </span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </Card>
  )
}

function ExpensesTab({
  month,
  expenses,
  inMonth,
  canEdit,
  t,
  L,
}: {
  month: string
  expenses: BizExpense[]
  inMonth: BizExpense[]
  canEdit: boolean
  t: T
  L: "en" | "ar"
}) {
  const [open, setOpen] = React.useState(false)
  const monthlyBills = EXPENSE_CATEGORIES.filter((c) => c.monthly)
  const billFor = (cat: string) => expenses.find((e) => e.category === cat && e.billMonth === month)

  const grouped = EXPENSE_GROUPS.map((g) => ({
    ...g,
    rows: inMonth.filter((e) => (EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.group ?? "admin") === g.value),
  })).filter((g) => g.rows.length)

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{t.billsChecklist}</h2>
          <p className="text-sm text-muted-foreground">{t.billsHint}</p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {monthlyBills.map((c) => {
            const b = billFor(c.value)
            return (
              <li
                key={c.value}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 ${
                  b ? "border-border bg-background/40" : "border-destructive/40 bg-destructive/10"
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{L === "ar" ? c.labelAr : c.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {b ? `AED ${aed(b.amount, L)}` : t.missing}
                  </span>
                </div>
                <Badge className={b ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}>
                  {b ? t.recorded : t.missing}
                </Badge>
              </li>
            )
          })}
        </ul>
      </Card>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">{t.readOnly}</p>
      ) : open ? (
        <ExpenseForm month={month} onDone={() => setOpen(false)} t={t} L={L} />
      ) : (
        <Button className="self-start" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t.addExpense}
        </Button>
      )}

      {grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{t.noExpenses}</Card>
      ) : (
        grouped.map((g) => {
          const total = g.rows.reduce((s, e) => s + e.amount, 0)
          return (
            <section key={g.value} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {L === "ar" ? g.labelAr : g.label}
                </h3>
                <span className="font-mono text-sm tabular-nums text-foreground">AED {aed(total, L)}</span>
              </div>
              <Card className="divide-y divide-border overflow-hidden">
                {g.rows.map((e) => (
                  <ExpenseRow key={e.id} e={e} canEdit={canEdit} t={t} L={L} />
                ))}
              </Card>
            </section>
          )
        })
      )}
    </div>
  )
}

function ExpenseRow({ e, canEdit, t, L }: { e: BizExpense; canEdit: boolean; t: T; L: "en" | "ar" }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  const openReceipt = async () => {
    if (!e.receiptPath) return
    const res = await getFinanceReceiptUrl(e.receiptPath)
    if ("url" in res) window.open(res.url, "_blank", "noopener,noreferrer")
    else alert(res.error)
  }

  const remove = async () => {
    if (!confirm(t.confirmDelete)) return
    setBusy(true)
    const res = await deleteBusinessExpense(e.id)
    setBusy(false)
    if (!res.ok) alert(res.error)
    else router.refresh()
  }

  const method = PAYMENT_METHODS.find((m) => m.value === e.method)
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{expenseCategoryLabel(e.category, L)}</span>
          {e.billMonth ? <Badge className="bg-muted text-muted-foreground">{e.billMonth}</Badge> : null}
          {e.hasInvoice ? <Badge className="bg-primary/15 text-primary">VAT</Badge> : null}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {[e.date, e.vendor, e.description, method ? (L === "ar" ? method.labelAr : method.label) : e.method, e.reference]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm tabular-nums text-foreground">AED {aed(e.amount, L)}</span>
        {e.receiptPath ? (
          <Button variant="ghost" size="sm" onClick={openReceipt}>
            <FileText className="size-4" />
            {t.view}
          </Button>
        ) : (
          <span className="text-xs text-destructive">{t.noReceipt}</span>
        )}
        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={remove} disabled={busy} aria-label={t.delete}>
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ExpenseForm({ month, onDone, t, L }: { month: string; onDone: () => void; t: T; L: "en" | "ar" }) {
  const router = useRouter()
  const [category, setCategory] = React.useState("dewa")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [fileName, setFileName] = React.useState("")
  const today = new Date().toISOString().slice(0, 10)
  const isMonthly = EXPENSE_CATEGORIES.find((c) => c.value === category)?.monthly

  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await addBusinessExpense(fd)
      if (!res.ok) setError(res.error)
      else {
        router.refresh()
        onDone()
      }
    })
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t.addExpense}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onDone} aria-label={t.cancel}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.type}>
            <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)} required>
              {EXPENSE_GROUPS.map((g) => (
                <optgroup key={g.value} label={L === "ar" ? g.labelAr : g.label}>
                  {EXPENSE_CATEGORIES.filter((c) => c.group === g.value).map((c) => (
                    <option key={c.value} value={c.value}>
                      {L === "ar" ? c.labelAr : c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label={t.vendor}>
            <Input name="vendor" placeholder={t.vendorPh} maxLength={150} />
          </Field>
          <Field label={t.amount}>
            <Input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required />
          </Field>
          <Field label={t.vat}>
            <Input name="vat_amount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue="0" />
          </Field>
          <Field label={t.date}>
            <Input name="expense_date" type="date" defaultValue={today.startsWith(month) ? today : `${month}-01`} required />
          </Field>
          {isMonthly ? (
            <Field label={t.billMonth}>
              <Input name="bill_month" type="month" defaultValue={month} required />
            </Field>
          ) : null}
          <Field label={t.method}>
            <Select name="payment_method" defaultValue="cash">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {L === "ar" ? m.labelAr : m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.reference}>
            <Input name="reference" maxLength={100} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t.description}>
              <Input name="description" placeholder={t.descPh} maxLength={500} />
            </Field>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">{t.receipt}</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-background/40 px-4 py-4 text-sm text-muted-foreground hover:border-primary">
              <Paperclip className="size-4 shrink-0" />
              <span className="truncate">{fileName || t.receiptHint}</span>
              <input
                type="file"
                name="receipt"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <input type="checkbox" name="has_invoice" className="size-4 accent-primary" />
            {t.taxInvoice}
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t.saving : t.save}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function SalariesTab({
  month,
  staff,
  canEdit,
  t,
  L,
}: {
  month: string
  staff: StaffPay[]
  canEdit: boolean
  t: T
  L: "en" | "ar"
}) {
  const [editing, setEditing] = React.useState<string | null>(null)
  const total = staff.reduce((s, p) => s + (p.payment?.net ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {!canEdit ? <p className="text-sm text-muted-foreground">{t.readOnly}</p> : null}
      <Card className="divide-y divide-border overflow-hidden">
        {staff.map((s) => (
          <div key={s.userId} className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[s.employeeId, s.title || s.role].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {s.payment ? (
                  <>
                    <span className="font-mono text-sm tabular-nums text-foreground">AED {aed(s.payment.net, L)}</span>
                    <Badge className="bg-primary/15 text-primary">
                      {t.paid} · {s.payment.paidOn}
                    </Badge>
                  </>
                ) : (
                  <Badge className="bg-destructive/15 text-destructive">{t.unpaid}</Badge>
                )}
                {canEdit && editing !== s.userId ? (
                  <Button variant={s.payment ? "ghost" : "primary"} size="sm" onClick={() => setEditing(s.userId)}>
                    {s.payment ? t.edit : t.pay}
                  </Button>
                ) : null}
              </div>
            </div>
            {editing === s.userId ? (
              <SalaryForm month={month} s={s} onDone={() => setEditing(null)} t={t} L={L} />
            ) : null}
          </div>
        ))}
      </Card>
      <div className="flex justify-end gap-2 text-sm">
        <span className="text-muted-foreground">{t.total}</span>
        <span className="font-mono tabular-nums text-foreground">AED {aed(total, L)}</span>
      </div>
    </div>
  )
}

function SalaryForm({ month, s, onDone, t, L }: { month: string; s: StaffPay; onDone: () => void; t: T; L: "en" | "ar" }) {
  const router = useRouter()
  const p = s.payment
  const [vals, setVals] = React.useState({
    base: p?.base ?? s.suggestedBase,
    allowances: p?.allowances ?? s.suggestedAllowances,
    overtime: p?.overtime ?? 0,
    deductions: p?.deductions ?? 0,
  })
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const net = vals.base + vals.allowances + vals.overtime - vals.deductions

  const num = (k: keyof typeof vals) => ({
    name: k === "base" ? "base_salary" : k,
    type: "number",
    inputMode: "decimal" as const,
    min: "0",
    step: "0.01",
    value: String(vals[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: Number(e.target.value) || 0 })),
  })

  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
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
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-background/40 p-4">
      <input type="hidden" name="user_id" value={s.userId} />
      <input type="hidden" name="period_month" value={month} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label={t.base}>
          <Input {...num("base")} required />
        </Field>
        <Field label={t.allowances}>
          <Input {...num("allowances")} />
        </Field>
        <Field label={t.overtime}>
          <Input {...num("overtime")} />
        </Field>
        <Field label={t.deductions}>
          <Input {...num("deductions")} />
        </Field>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t.netPreview}:{" "}
          <span className={`font-mono tabular-nums ${net < 0 ? "text-destructive" : "text-foreground"}`}>
            AED {aed(net, L)}
          </span>
        </span>
        <div className="flex gap-2">
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
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
