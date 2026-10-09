import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { Inbox } from "lucide-react"
import { LeadsBoard } from "@/components/leads-board"
import { LeadsLoadError, StaffListUnavailableNotice } from "@/components/leads-load-notice"
import { loadLeadsPageData } from "@/lib/leads-page-data"

export const metadata = { title: "Leads · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  await requirePageAccess(["leads.view"], "Leads")
  const user = await getShellUser()
  const supabase = await createClient()

  const result = await loadLeadsPageData(supabase)
  const leads = result.state === "error" ? [] : result.leads
  const canManage = user.permissions.includes("leads.manage")
  const openCount = leads.filter((l) => l.status !== "converted" && l.status !== "lost").length

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            {result.state === "error" ? null : (
              <p className="text-sm text-muted-foreground">
                {openCount} open lead{openCount === 1 ? "" : "s"} from the website
              </p>
            )}
          </div>
        </div>

        {result.state !== "error" && result.staffUnavailable && canManage ? <StaffListUnavailableNotice /> : null}

        {result.state === "error" ? (
          <LeadsLoadError />
        ) : result.state === "empty" ? (
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
          <LeadsBoard
            leads={result.leads}
            staff={result.staff}
            canManage={canManage}
            assignmentUnavailable={result.staffUnavailable}
          />
        )}
      </div>
    </AppShell>
  )
}
