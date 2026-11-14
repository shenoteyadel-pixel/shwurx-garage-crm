import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { createServiceClient } from "@/lib/supabase/server"
import { AddonCatalogClient } from "@/components/addon-catalog-client"
import { getAddonPolicy } from "@/lib/addon-sales-data"

export const metadata = { title: "Add-on Catalog · SHWURX Auto Service Center" }

export default async function AddonCatalogPage() {
  await requirePageAccess(["settings.manage"], "Add-on Catalog")
  const user = await getShellUser()
  const svc = createServiceClient()
  const [{ data: items }, { data: suppliers }, policy] = await Promise.all([
    svc.from("addon_catalog").select("*").order("category").order("name"),
    svc.from("suppliers").select("id, name").order("name"),
    getAddonPolicy(svc),
  ])
  return (
    <AppShell user={user}>
      <AddonCatalogClient items={items ?? []} suppliers={suppliers ?? []} policy={policy} />
    </AppShell>
  )
}
