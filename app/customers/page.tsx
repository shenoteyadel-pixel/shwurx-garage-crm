import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, Badge, Button } from "@/components/ui"
import { formatDate } from "@/lib/utils"
import { Plus, Users, Phone, Car } from "lucide-react"

export const metadata = { title: "Customers · SHWURX Auto Service Center" }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const user = await getShellUser()
  const supabase = await createClient()

  let query = supabase
    .from("customers")
    .select("id, full_name, mobile, company_name, email, status, created_at")
    .order("full_name")

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,mobile.ilike.%${q}%,alt_mobile.ilike.%${q}%,company_name.ilike.%${q}%`,
    )
  }

  const { data: customers } = await query

  // Vehicle counts per customer (single grouped read).
  const ids = (customers ?? []).map((c) => c.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: vs } = await supabase.from("vehicles").select("customer_id").in("customer_id", ids)
    for (const v of vs ?? []) {
      if (v.customer_id) counts.set(v.customer_id, (counts.get(v.customer_id) ?? 0) + 1)
    }
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">
              {(customers ?? []).length} customer{(customers ?? []).length === 1 ? "" : "s"} on file
            </p>
          </div>
          <Link href="/customers/new">
            <Button>
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          </Link>
        </div>

        <form className="mb-5" action="/customers">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, mobile, or company"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
        </form>

        {(customers ?? []).length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q ? "No customers match your search." : "No customers yet. Create your first customer."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {(customers ?? []).map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`}>
                <Card className="flex items-center justify-between gap-4 p-4 transition-colors hover:border-primary/50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{c.full_name}</span>
                      {c.company_name ? (
                        <Badge className="bg-muted text-muted-foreground">{c.company_name}</Badge>
                      ) : null}
                      {c.status === "inactive" ? (
                        <Badge className="bg-muted text-muted-foreground">Inactive</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {c.mobile ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.mobile}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Car className="h-3 w-3" /> {counts.get(c.id) ?? 0} vehicle
                        {(counts.get(c.id) ?? 0) === 1 ? "" : "s"}
                      </span>
                      <span>Added {formatDate(c.created_at)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
