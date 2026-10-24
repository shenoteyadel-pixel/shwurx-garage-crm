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
    .select("id, invoice_number, customer_name, plate, status, issue_date, total, amount_paid")
    .order("created_at", { ascending: false })

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
        <InvoicesClient invoices={invoices ?? []} paidWithoutInvoice={paidWithoutInvoice} />
      </div>
    </AppShell>
  )
}
