import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { InvoicesClient } from "@/components/invoices-client"

export const metadata = { title: "Invoices · SHWURX Garage" }

export default async function InvoicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, plate, status, issue_date, total, amount_paid")
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto max-w-6xl">
      <InvoicesClient invoices={invoices ?? []} />
    </div>
  )
}
