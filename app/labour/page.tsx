import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { LabourTypesClient } from "@/components/labour-types-client"
import { listLabourTypes } from "@/lib/actions-labour"

export const metadata = { title: "Labour & Hours · SHWURX Auto Service Center" }

export default async function LabourPage() {
  const ctx = await requirePageAccess(["quotations.edit", "settings.manage"], "Labour & Hours")
  const [user, types] = await Promise.all([getShellUser(), listLabourTypes()])

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-balance">Labour & Hours</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Every kind of labour the workshop charges for. Active types appear as quick picks in the quotation builder
            and fill in the name, rate and default hours. Prices on quotes already sent are not changed.
          </p>
        </header>
        <LabourTypesClient types={types} canEdit={ctx.permissions.has("settings.manage")} />
      </div>
    </AppShell>
  )
}
