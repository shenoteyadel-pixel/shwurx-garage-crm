import Link from "next/link"
import { notFound } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { createClient } from "@/lib/supabase/server"
import { VehicleCreateForm } from "@/components/vehicle-create-form"
import { ArrowLeft } from "lucide-react"

export const metadata = { title: "Add Vehicle · SHWURX Auto Service Center" }

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer: customerId } = await searchParams
  if (!customerId) notFound()

  const user = await getShellUser()
  const supabase = await createClient()
  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, mobile")
    .eq("id", customerId)
    .maybeSingle()
  if (!customer) notFound()

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/customers/${customer.id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {customer.full_name}
        </Link>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Add Vehicle</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          New vehicle for {customer.full_name}
          {customer.mobile ? ` · ${customer.mobile}` : ""}
        </p>
        <VehicleCreateForm customerId={customer.id} />
      </div>
    </AppShell>
  )
}
