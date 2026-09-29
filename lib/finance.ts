import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadVatReport } from "@/lib/vat-report"

export type SaleRow = {
  number: string
  date: string
  customer: string
  plate: string
  net: number
  vat: number
  total: number
  paid: number
  balance: number
  status: string
}

export type PurchaseRow = {
  number: string
  date: string
  supplier: string
  net: number
  vat: number
  total: number
  paid: number
  balance: number
  status: string
}

export type PaymentRow = {
  date: string
  direction: "in" | "out"
  amount: number
  method: string
  reference: string
  against: string
  party: string
  hasReceipt: boolean
}

export type ExpenseRow = {
  date: string
  category: string
  vendor: string
  description: string
  amount: number
  hasInvoice: boolean
  reference: string
}

export type AgingRow = {
  ref: string
  party: string
  date: string
  total: number
  paid: number
  balance: number
  days: number
  bucket: AgingBucket
}

export type AuditRow = {
  at: string
  actor: string
  role: string
  action: string
  resource: string
  status: string
  detail: string
}

export const AGING_BUCKETS = ["Current (0-30)", "31-60 days", "61-90 days", "Over 90 days"] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export type LedgerRow = {
  date: string
  type: "Sale" | "Purchase" | "Payment in" | "Payment out" | "Expense"
  ref: string
  party: string
  moneyIn: number
  moneyOut: number
}

export type FinanceReport = {
  from: string
  to: string
  generatedAt: string
  pnl: {
    partsRevenue: number
    labourRevenue: number
    discount: number
    salesNet: number
    purchasesNet: number
    expenses: number
    grossProfit: number
    netProfit: number
    margin: number
  }
  cash: { moneyIn: number; moneyOut: number; net: number; byMethod: { method: string; moneyIn: number; moneyOut: number }[] }
  vat: { output: number; input: number; net: number; blocked: number }
  receivables: { total: number; buckets: { label: AgingBucket; amount: number }[]; rows: AgingRow[] }
  payables: { total: number; buckets: { label: AgingBucket; amount: number }[]; rows: AgingRow[] }
  sales: SaleRow[]
  purchases: PurchaseRow[]
  payments: PaymentRow[]
  expenses: ExpenseRow[]
  ledger: LedgerRow[]
  audit: AuditRow[]
}

const n = (v: unknown) => Number(v) || 0
const r2 = (v: number) => Math.round(v * 100) / 100
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "")

function bucketFor(days: number): AgingBucket {
  if (days <= 30) return AGING_BUCKETS[0]
  if (days <= 60) return AGING_BUCKETS[1]
  if (days <= 90) return AGING_BUCKETS[2]
  return AGING_BUCKETS[3]
}

function aging(rows: AgingRow[]) {
  return {
    total: r2(rows.reduce((s, r) => s + r.balance, 0)),
    buckets: AGING_BUCKETS.map((label) => ({
      label,
      amount: r2(rows.filter((r) => r.bucket === label).reduce((s, r) => s + r.balance, 0)),
    })),
    rows: rows.sort((a, b) => b.days - a.days),
  }
}

function describeDetail(detail: unknown) {
  if (!detail) return ""
  if (typeof detail === "string") return detail
  try {
    return Object.entries(detail as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("; ")
  } catch {
    return ""
  }
}

export async function loadFinanceReport(supabase: SupabaseClient, from: string, to: string): Promise<FinanceReport> {
  const toEnd = `${to}T23:59:59.999`
  const today = new Date()

  const [invRes, billRes, poRes, payRes, expRes, openInvRes, openBillRes, auditRes, vat] = await Promise.all([
    supabase
      .from("invoices")
      .select("invoice_number, issue_date, customer_name, plate, parts_total, labour_total, discount, subtotal, vat_amount, total, amount_paid, status")
      .neq("status", "cancelled")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date"),
    supabase
      .from("supplier_invoices")
      .select("doc_number, invoice_number, invoice_date, supplier_name_raw, subtotal, vat_amount, total, amount_paid, payment_status, suppliers(name)")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date"),
    supabase
      .from("purchase_orders")
      .select("po_number, supplier_invoice_no, order_date, subtotal, vat_amount, total, status, suppliers(name)")
      .neq("status", "cancelled")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date"),
    supabase
      .from("payments")
      .select("direction, amount, method, reference, paid_at, note, invoice_id, supplier_invoice_id, po_id, receipt_path")
      .gte("paid_at", from)
      .lte("paid_at", toEnd)
      .order("paid_at"),
    supabase
      .from("car_expenses")
      .select("expense_date, category, vendor, description, amount, has_invoice, reference")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date"),
    supabase
      .from("invoices")
      .select("invoice_number, issue_date, due_date, customer_name, total, amount_paid, status")
      .not("status", "in", "(cancelled,draft)")
      .lte("issue_date", to),
    supabase
      .from("supplier_invoices")
      .select("doc_number, invoice_number, invoice_date, supplier_name_raw, total, amount_paid, suppliers(name)")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .lte("invoice_date", to),
    supabase
      .from("audit_logs")
      .select("created_at, actor_name, actor_role, action, resource_type, resource_id, status, detail")
      .gte("created_at", from)
      .lte("created_at", toEnd)
      .order("created_at")
      .limit(5000),
    loadVatReport(supabase, from, to),
  ])

  const sales: SaleRow[] = (invRes.data ?? []).map((i) => {
    const total = n(i.total)
    const paid = n(i.amount_paid)
    return {
      number: i.invoice_number,
      date: day(i.issue_date),
      customer: i.customer_name ?? "",
      plate: i.plate ?? "",
      net: n(i.subtotal),
      vat: n(i.vat_amount),
      total,
      paid,
      balance: r2(Math.max(0, total - paid)),
      status: i.status ?? "",
    }
  })

  const purchases: PurchaseRow[] = [
    ...(billRes.data ?? []).map((b: any) => {
      const total = n(b.total)
      const paid = n(b.amount_paid)
      return {
        number: b.invoice_number || b.doc_number,
        date: day(b.invoice_date),
        supplier: b.suppliers?.name ?? b.supplier_name_raw ?? "Unknown supplier",
        net: n(b.subtotal),
        vat: n(b.vat_amount),
        total,
        paid,
        balance: r2(Math.max(0, total - paid)),
        status: b.payment_status ?? "",
      }
    }),
    ...(poRes.data ?? []).map((p: any) => ({
      number: p.supplier_invoice_no || p.po_number,
      date: day(p.order_date),
      supplier: p.suppliers?.name ?? "Unknown supplier",
      net: n(p.subtotal),
      vat: n(p.vat_amount),
      total: n(p.total),
      paid: 0,
      balance: 0,
      status: p.status ?? "",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  // Payments can settle documents issued outside the period, so resolve their references separately.
  const payRows = payRes.data ?? []
  const ids = (key: "invoice_id" | "supplier_invoice_id" | "po_id") =>
    [...new Set(payRows.map((p) => p[key]).filter(Boolean))] as string[]
  const invIds = ids("invoice_id")
  const billIds = ids("supplier_invoice_id")
  const poIds = ids("po_id")
  const [refInv, refBill, refPo] = await Promise.all([
    invIds.length ? supabase.from("invoices").select("id, invoice_number, customer_name").in("id", invIds) : { data: [] },
    billIds.length
      ? supabase.from("supplier_invoices").select("id, invoice_number, doc_number, supplier_name_raw, suppliers(name)").in("id", billIds)
      : { data: [] },
    poIds.length ? supabase.from("purchase_orders").select("id, po_number, suppliers(name)").in("id", poIds) : { data: [] },
  ])
  const invMap = new Map((refInv.data ?? []).map((x: any) => [x.id, x]))
  const billMap = new Map((refBill.data ?? []).map((x: any) => [x.id, x]))
  const poMap = new Map((refPo.data ?? []).map((x: any) => [x.id, x]))

  const payments: PaymentRow[] = payRows.map((p: any) => {
    let against = ""
    let party = ""
    if (p.invoice_id && invMap.has(p.invoice_id)) {
      const x: any = invMap.get(p.invoice_id)
      against = x.invoice_number
      party = x.customer_name ?? ""
    } else if (p.supplier_invoice_id && billMap.has(p.supplier_invoice_id)) {
      const x: any = billMap.get(p.supplier_invoice_id)
      against = x.invoice_number || x.doc_number
      party = x.suppliers?.name ?? x.supplier_name_raw ?? ""
    } else if (p.po_id && poMap.has(p.po_id)) {
      const x: any = poMap.get(p.po_id)
      against = x.po_number
      party = x.suppliers?.name ?? ""
    }
    return {
      date: day(p.paid_at),
      direction: p.direction === "out" ? "out" : "in",
      amount: n(p.amount),
      method: p.method || "cash",
      reference: p.reference || p.note || "",
      against,
      party,
      hasReceipt: !!p.receipt_path,
    }
  })

  const expenses: ExpenseRow[] = (expRes.data ?? []).map((e: any) => ({
    date: day(e.expense_date),
    category: e.category ?? "other",
    vendor: e.vendor ?? "",
    description: e.description ?? "",
    amount: n(e.amount),
    hasInvoice: !!e.has_invoice,
    reference: e.reference ?? "",
  }))

  const daysSince = (d: string) => Math.max(0, Math.floor((today.getTime() - new Date(d).getTime()) / 86_400_000))

  const receivableRows: AgingRow[] = (openInvRes.data ?? [])
    .map((i: any) => {
      const total = n(i.total)
      const paid = n(i.amount_paid)
      const d = day(i.due_date || i.issue_date)
      const days = daysSince(d)
      return { ref: i.invoice_number, party: i.customer_name ?? "", date: day(i.issue_date), total, paid, balance: r2(total - paid), days, bucket: bucketFor(days) }
    })
    .filter((r) => r.balance > 0.009)

  const payableRows: AgingRow[] = (openBillRes.data ?? [])
    .map((b: any) => {
      const total = n(b.total)
      const paid = n(b.amount_paid)
      const d = day(b.invoice_date)
      const days = daysSince(d)
      return {
        ref: b.invoice_number || b.doc_number,
        party: b.suppliers?.name ?? b.supplier_name_raw ?? "Unknown supplier",
        date: d,
        total,
        paid,
        balance: r2(total - paid),
        days,
        bucket: bucketFor(days),
      }
    })
    .filter((r) => r.balance > 0.009)

  const sum = <T,>(rows: T[], f: (r: T) => number) => r2(rows.reduce((s, r) => s + f(r), 0))
  const invData = invRes.data ?? []
  const salesNet = sum(sales, (s) => s.net)
  const purchasesNet = sum(purchases, (p) => p.net)
  const expenseTotal = sum(expenses, (e) => e.amount)
  const grossProfit = r2(salesNet - purchasesNet)
  const netProfit = r2(grossProfit - expenseTotal)

  const methods = new Map<string, { moneyIn: number; moneyOut: number }>()
  for (const p of payments) {
    const m = methods.get(p.method) ?? { moneyIn: 0, moneyOut: 0 }
    if (p.direction === "in") m.moneyIn += p.amount
    else m.moneyOut += p.amount
    methods.set(p.method, m)
  }
  const moneyIn = sum(payments.filter((p) => p.direction === "in"), (p) => p.amount)
  const moneyOut = sum(payments.filter((p) => p.direction === "out"), (p) => p.amount)

  const ledger: LedgerRow[] = [
    ...sales.map((s) => ({ date: s.date, type: "Sale" as const, ref: s.number, party: s.customer, moneyIn: 0, moneyOut: 0 })),
    ...purchases.map((p) => ({ date: p.date, type: "Purchase" as const, ref: p.number, party: p.supplier, moneyIn: 0, moneyOut: 0 })),
    ...payments.map((p) => ({
      date: p.date,
      type: (p.direction === "in" ? "Payment in" : "Payment out") as LedgerRow["type"],
      ref: p.against || p.reference || "-",
      party: p.party,
      moneyIn: p.direction === "in" ? p.amount : 0,
      moneyOut: p.direction === "out" ? p.amount : 0,
    })),
    ...expenses.map((e) => ({ date: e.date, type: "Expense" as const, ref: e.reference || e.category, party: e.vendor, moneyIn: 0, moneyOut: e.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const audit: AuditRow[] = (auditRes.data ?? []).map((a: any) => ({
    at: a.created_at,
    actor: a.actor_name ?? "System",
    role: a.actor_role ?? "",
    action: String(a.action ?? "").replace(/[._]/g, " "),
    resource: [a.resource_type, a.resource_id ? String(a.resource_id).slice(0, 8) : ""].filter(Boolean).join(" #"),
    status: a.status ?? "",
    detail: describeDetail(a.detail),
  }))

  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    pnl: {
      partsRevenue: sum(invData, (i: any) => n(i.parts_total)),
      labourRevenue: sum(invData, (i: any) => n(i.labour_total)),
      discount: sum(invData, (i: any) => n(i.discount)),
      salesNet,
      purchasesNet,
      expenses: expenseTotal,
      grossProfit,
      netProfit,
      margin: salesNet ? r2((netProfit / salesNet) * 100) : 0,
    },
    cash: {
      moneyIn,
      moneyOut,
      net: r2(moneyIn - moneyOut),
      byMethod: [...methods.entries()].map(([method, v]) => ({ method, moneyIn: r2(v.moneyIn), moneyOut: r2(v.moneyOut) })),
    },
    vat: { output: vat.box12, input: vat.box13, net: vat.box14, blocked: vat.blockedInputVat },
    receivables: aging(receivableRows),
    payables: aging(payableRows),
    sales,
    purchases,
    payments,
    expenses,
    ledger,
    audit,
  }
}
