import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { Inbox } from "lucide-react"
import { LeadsBoard } from "@/components/leads-board"
import type { LeadRow } from "@/lib/actions-leads"

export const metadata = { title: "Leads · SHWURX Garage" }
export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  await requirePageAccess(["leads.view"], "Leads")
  const user = await getShellUser()
  const supabase = await createClient()

  const [{ data: leadData }, { data: staffData }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, phone, email, message, service_interest, source, status, customer_id, metadata, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("is_active", true)
      .neq("role", "customer")
      .order("full_name"),
  ])

  const leads = (leadData ?? []) as LeadRow[]
  const staff = (staffData ?? []).map((s) => ({
    id: s.id as string,
    name: (s.full_name as string) || (s.email as string) || "Staff",
  }))
  const canManage = user.permissions.includes("leads.manage")
  const openCount = leads.filter((l) => l.status !== "converted" && l.status !== "lost").length

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {openCount} open lead{openCount === 1 ? "" : "s"} from the website
            </p>
          </div>
        </div>

        {leads.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium text-foreground">No leads yet</p>
              <p className="text-sm text-muted-foreground">
                Contact-form and enquiry submissions from the SHWURX website will appear here
                automatically, ready to follow up and convert into customers.
              </p>
            </div>
          </Card>
        ) : (
          <LeadsBoard leads={leads} staff={staff} canManage={canManage} />
        )}
      </div>
    </AppShell>
  )
}
