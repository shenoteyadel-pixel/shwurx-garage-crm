"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireAnyPermission, logAction } from "@/lib/rbac/context"
import { EXPENSE_CATEGORY_MAP, PAYMENT_METHOD_VALUES } from "@/lib/expense-categories"

const RECEIPT_BUCKET = "finance-receipts"
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

type Result = { ok: true } | { ok: false; error: string }

const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim() || 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
const isMonth = (v: string) => /^\d{4}-\d{2}$/.test(v)
const text = (v: FormDataEntryValue | null, max = 300) => String(v ?? "").trim().slice(0, max) || null

function revalidateFinance() {
  revalidatePath("/finance")
  revalidatePath("/finance/expenses")
}

export async function addBusinessExpense(formData: FormData): Promise<Result> {
  const ctx = await requirePermission("expenses.manage")
  const supabase = await createClient()

  const category = String(formData.get("category") || "")
  const cat = EXPENSE_CATEGORY_MAP[category]
  if (!cat) return { ok: false, error: "Choose an expense type." }

  const amount = money(formData.get("amount"))
  const vat = money(formData.get("vat_amount"))
  if (!(amount > 0) || amount > 10_000_000) return { ok: false, error: "Enter the total amount paid." }
  if (!(vat >= 0) || vat > amount) return { ok: false, error: "VAT must be between 0 and the total amount." }

  const expenseDate = String(formData.get("expense_date") || "")
  if (!isDate(expenseDate)) return { ok: false, error: "Enter the payment date." }

  const billMonthRaw = String(formData.get("bill_month") || "")
  const billMonth = cat.monthly ? (isMonth(billMonthRaw) ? `${billMonthRaw}-01` : `${expenseDate.slice(0, 7)}-01`) : null

  const method = String(formData.get("payment_method") || "cash")
  if (!PAYMENT_METHOD_VALUES.includes(method)) return { ok: false, error: "Choose a payment method." }

  let receiptPath: string | null = null
  const file = formData.get("receipt")
  if (file instanceof File && file.size > 0) {
    const ext = RECEIPT_TYPES[file.type]
    if (!ext) return { ok: false, error: "Receipt must be a photo (JPG, PNG, WEBP, HEIC) or a PDF." }
    if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: "Receipt file must be 10 MB or smaller." }
    receiptPath = `${expenseDate.slice(0, 7)}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(receiptPath, file, { contentType: file.type, upsert: false })
    if (upErr) return { ok: false, error: `Receipt upload failed: ${upErr.message}` }
  }

  const { data, error } = await supabase
    .from("business_expenses")
    .insert({
      category,
      description: text(formData.get("description"), 500),
      vendor: text(formData.get("vendor"), 150),
      amount,
      vat_amount: vat,
      expense_date: expenseDate,
      bill_month: billMonth,
      payment_method: method,
      reference: text(formData.get("reference"), 100),
      has_invoice: formData.get("has_invoice") === "on",
      receipt_path: receiptPath,
      created_by: ctx.userId,
    })
    .select("id")
    .single()

  if (error) {
    if (receiptPath) await supabase.storage.from(RECEIPT_BUCKET).remove([receiptPath])
    return { ok: false, error: error.message }
  }

  await logAction(ctx, "business_expense.add", "business_expense", data.id, { category, amount, receipt: !!receiptPath })
  revalidateFinance()
  return { ok: true }
}

export async function deleteBusinessExpense(id: string): Promise<Result> {
  const ctx = await requirePermission("expenses.manage")
  const supabase = await createClient()

  const { data: row } = await supabase.from("business_expenses").select("receipt_path, amount, category").eq("id", id).maybeSingle()
  if (!row) return { ok: false, error: "Expense not found." }

  const { error } = await supabase.from("business_expenses").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  if (row.receipt_path) await supabase.storage.from(RECEIPT_BUCKET).remove([row.receipt_path])

  await logAction(ctx, "business_expense.delete", "business_expense", id, { amount: row.amount, category: row.category })
  revalidateFinance()
  return { ok: true }
}

export async function getFinanceReceiptUrl(path: string): Promise<{ url: string } | { error: string }> {
  await requireAnyPermission(["expenses.manage", "reports.financial"])
  if (!/^\d{4}-\d{2}\/[0-9a-f-]{36}\.[a-z]+$/.test(path)) return { error: "Invalid receipt." }
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 120)
  if (error || !data) return { error: error?.message || "Could not open receipt." }
  return { url: data.signedUrl }
}

export async function recordSalaryPayment(formData: FormData): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  const supabase = await createClient()

  const userId = String(formData.get("user_id") || "")
  const period = String(formData.get("period_month") || "")
  if (!/^[0-9a-f-]{36}$/.test(userId)) return { ok: false, error: "Choose an employee." }
  if (!isMonth(period)) return { ok: false, error: "Choose the salary month." }

  const base = money(formData.get("base_salary"))
  const allowances = money(formData.get("allowances"))
  const overtime = money(formData.get("overtime"))
  const deductions = money(formData.get("deductions"))
  if ([base, allowances, overtime, deductions].some((v) => !(v >= 0) || v > 1_000_000))
    return { ok: false, error: "Salary amounts must be zero or more." }

  const net = Math.round((base + allowances + overtime - deductions) * 100) / 100
  if (net < 0) return { ok: false, error: "Deductions cannot be more than the salary." }

  const paidOn = String(formData.get("paid_on") || "")
  if (!isDate(paidOn)) return { ok: false, error: "Enter the payment date." }

  const method = String(formData.get("payment_method") || "bank_transfer")
  if (!PAYMENT_METHOD_VALUES.includes(method)) return { ok: false, error: "Choose a payment method." }

  const { data: staff } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle()
  if (!staff) return { ok: false, error: "Employee not found." }

  const { data, error } = await supabase
    .from("salary_payments")
    .upsert(
      {
        user_id: userId,
        period_month: `${period}-01`,
        base_salary: base,
        allowances,
        overtime,
        deductions,
        net_amount: net,
        payment_method: method,
        reference: text(formData.get("reference"), 100),
        note: text(formData.get("note"), 300),
        paid_on: paidOn,
        created_by: ctx.userId,
      },
      { onConflict: "user_id,period_month" },
    )
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, "salary.pay", "salary_payment", data.id, { user_id: userId, period, net })
  revalidateFinance()
  return { ok: true }
}

export async function deleteSalaryPayment(id: string): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  const supabase = await createClient()
  const { error } = await supabase.from("salary_payments").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "salary.delete", "salary_payment", id, {})
  revalidateFinance()
  return { ok: true }
}
