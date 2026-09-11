"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requirePermission, logAction } from "@/lib/rbac/context"

// Add a cost against a specific car (job card). Supports expenses with no
// supplier invoice — the person can optionally attach a receipt photo and note
// a reference instead. Writing requires purchase_orders.manage (enforced again
// by RLS on car_expenses).
export async function addCarExpense(jobId: string, formData: FormData) {
  const ctx = await requirePermission("purchase_orders.manage")
  const supabase = await createClient()

  const amount = Number(formData.get("amount") || 0)
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount.")

  const category = String(formData.get("category") || "other")
  const description = String(formData.get("description") || "").trim() || null
  const vendor = String(formData.get("vendor") || "").trim() || null
  const hasInvoice = formData.get("has_invoice") === "on" || formData.get("has_invoice") === "true"
  const reference = String(formData.get("reference") || "").trim() || null
  const receiptUrl = String(formData.get("receipt_url") || "").trim() || null
  const expenseDate = String(formData.get("expense_date") || "").trim()

  const payload: Record<string, unknown> = {
    job_id: jobId,
    category,
    description,
    amount,
    vendor,
    has_invoice: hasInvoice,
    reference,
    receipt_url: receiptUrl,
    created_by: ctx.userId,
  }
  if (expenseDate) payload.expense_date = expenseDate

  const { error } = await supabase.from("car_expenses").insert(payload)
  if (error) throw new Error(error.message)

  await logAction(ctx, "car_expense.add", "job", jobId, { amount, category, has_invoice: hasInvoice })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/purchasing/expenses")
}

export async function deleteCarExpense(id: string, jobId: string) {
  const ctx = await requirePermission("purchase_orders.manage")
  const supabase = await createClient()

  const { error } = await supabase.from("car_expenses").delete().eq("id", id)
  if (error) throw new Error(error.message)

  await logAction(ctx, "car_expense.delete", "job", jobId, { id })
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/purchasing/expenses")
}
