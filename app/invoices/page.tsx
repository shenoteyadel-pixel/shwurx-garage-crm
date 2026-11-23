import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { InvoicesClient } from "@/components/invoices-client"

export const metadata = { title: "Invoices · SHWURX Auto Service Center" }

export default async function InvoicesPage() {
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, job_id, customer_name, customer_mobile, vehicle_desc, plate, status, issue_date, total, amount_paid, created_by")
    .order("created_at", { ascending: false })

  const invoiceIds = (invoices ?? []).map((i) => i.id)
  const { data: payments } = invoiceIds.length
    ? await supabase
        .from("payments")
        .select("invoice_id, paid_at, method, receipt_path")
        .in("invoice_id", invoiceIds)
        .order("paid_at", { ascending: false })
    : { data: [] as { invoice_id: string | null; paid_at: string | null; method: string | null; receipt_path: string | null }[] }
  const lastPayment = new Map<string, { paid_at: string | null; method: string | null; hasReceipt: boolean }>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    const prev = lastPayment.get(p.invoice_id)
    if (!prev) lastPayment.set(p.invoice_id, { paid_at: p.paid_at, method: p.method, hasReceipt: !!p.receipt_path })
    else if (p.receipt_path) prev.hasReceipt = true
  }

  const { data: openJobs } = await supabase
    .from("jobs")
    .select("id, job_number, customer_name, customer_mobile, plate_code, plate_number, vehicle_make, vehicle_model, vehicle_year, stage, created_at, created_by")
    .neq("stage", "delivered")
    .is("paid_at", null)
    .order("created_at", { ascending: false })
    .limit(300)
  const openJobIds = (openJobs ?? []).map((j) => j.id)
  const { data: openJobInvoices } = openJobIds.length
    ? await supabase.from("invoices").select("job_id").in("job_id", openJobIds).neq("status", "cancelled")
    : { data: [] as { job_id: string | null }[] }
  const openInvoiced = new Set((openJobInvoices ?? []).map((i) => i.job_id))
  const notInvoiced = (openJobs ?? []).filter((j) => !openInvoiced.has(j.id))

  const userIds = Array.from(
    new Set([...(invoices ?? []).map((i) => i.created_by), ...notInvoiced.map((j) => j.created_by)].filter(Boolean) as string[]),
  )
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || null]))

  const invoiceRows = (invoices ?? []).map((i) => {
    const pay = lastPayment.get(i.id)
    return {
      ...i,
      created_by_name: i.created_by ? nameOf.get(i.created_by) ?? null : null,
      last_paid_at: pay?.paid_at ?? null,
      last_method: pay?.method ?? null,
      has_receipt: pay?.hasReceipt ?? false,
    }
  })
  const notInvoicedRows = notInvoiced.map((j) => ({
    ...j,
    created_by_name: j.created_by ? nameOf.get(j.created_by) ?? null : null,
  }))

  // Jobs where payment was recorded but no customer invoice exists (legacy
  // Car Flow "Mark paid" path). Read-only review list; nothing is changed here.
  const { data: paidJobs } = await supabase
    .from("jobs")
    .select("id, job_number, customer_name, plate_code, plate_number, vehicle_make, vehicle_model, paid_at, paid_amount, payment_method")
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false })
    .limit(200)
  const paidJobIds = (paidJobs ?? []).map((j) => j.id)
  const { data: jobInvoices } = paidJobIds.length
    ? await supabase.from("invoices").select("job_id").in("job_id", paidJobIds).neq("status", "cancelled")
    : { data: [] as { job_id: string | null }[] }
  const invoicedJobIds = new Set((jobInvoices ?? []).map((i) => i.job_id))
  const paidWithoutInvoice = (paidJobs ?? []).filter((j) => !invoicedJobIds.has(j.id))

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <InvoicesClient invoices={invoiceRows} paidWithoutInvoice={paidWithoutInvoice} notInvoiced={notInvoicedRows} />
      </div>
    </AppShell>
  )
}
