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

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <InvoicesClient invoices={invoices ?? []} />
      </div>
    </AppShell>
  )
}
