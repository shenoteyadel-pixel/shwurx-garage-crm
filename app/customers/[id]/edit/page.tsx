import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { CustomerForm } from "@/components/customer-form"
import { ArrowLeft } from "lucide-react"

export const metadata = { title: "Edit Customer · SHWURX Auto Service Center" }

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getShellUser()
  if (!user.permissions.includes("customers.edit")) redirect(`/customers/${id}`)

  const supabase = await createClient()
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, full_name, mobile, alt_mobile, whatsapp, email, customer_type, company_name, trn, trade_license, address, notes, status",
    )
    .eq("id", id)
    .maybeSingle()
  if (!customer) notFound()

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/customers/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to customer
        </Link>
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Edit Customer</h1>
        <CustomerForm customer={customer} redirectTo={`/customers/${id}`} />
      </div>
    </AppShell>
  )
}
