import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { ExpensesPayrollView, type BizExpense } from "@/components/expenses-payroll-view"

export const metadata = { title: "General Expenses · SHWURX Auto Service Center" }

const monthStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export default async function GeneralExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requirePageAccess(["purchase_orders.manage", "expenses.manage"], "General Expenses")
  const sp = await searchParams
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : monthStr(new Date())
  const [y, mo] = month.split("-").map(Number)
  const from = `${month}-01`
  const to = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`

  const supabase = await createClient()
  const [shellUser, canManage, canPurchase, expRes] = await Promise.all([
    getShellUser(),
    can("expenses.manage"),
    can("purchase_orders.manage"),
    supabase
      .from("business_expenses")
      .select("id, category, description, vendor, amount, vat_amount, expense_date, bill_month, payment_method, reference, has_invoice, receipt_path")
      .or(`and(expense_date.gte.${from},expense_date.lte.${to}),bill_month.eq.${from}`)
      .order("expense_date", { ascending: false }),
  ])

  const expenses: BizExpense[] = (expRes.data ?? []).map((e: any) => ({
    id: e.id,
    category: e.category,
    description: e.description ?? "",
    vendor: e.vendor ?? "",
    amount: Number(e.amount) || 0,
    vat: Number(e.vat_amount) || 0,
    date: String(e.expense_date).slice(0, 10),
    billMonth: e.bill_month ? String(e.bill_month).slice(0, 7) : null,
    method: e.payment_method || "cash",
    reference: e.reference ?? "",
    hasInvoice: !!e.has_invoice,
    receiptPath: e.receipt_path ?? null,
  }))

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <ExpensesPayrollView
          month={month}
          expenses={expenses}
          staff={[]}
          canExpenses={canManage || canPurchase}
          canPayroll={false}
          expensesOnly
          basePath="/purchasing/general-expenses"
          tabs={<PurchasingTabs perms={shellUser.permissions} />}
        />
      </div>
    </AppShell>
  )
}
