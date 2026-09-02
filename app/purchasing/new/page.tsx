import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PurchaseOrderForm } from "@/components/purchase-order-form"

export const metadata = { title: "New Purchase Order · SHWURX Garage" }

export default async function NewPOPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; job?: string }>
}) {
  const { supplier, job } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const [{ data: suppliers }, { data: items }, { data: jobs }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.from("inventory_items").select("id, name, cost_price, unit").order("name"),
    supabase.from("jobs").select("id, job_number, customer_name").neq("stage", "delivered").order("created_at", { ascending: false }),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">New Purchase Order</h1>
      <PurchaseOrderForm
        suppliers={suppliers ?? []}
        items={items ?? []}
        jobs={jobs ?? []}
        defaultSupplier={supplier ?? null}
        defaultJob={job ?? null}
      />
    </div>
  )
}
