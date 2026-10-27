import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { PriceCatalogClient } from "@/components/price-catalog-client"
import { listCatalog } from "@/lib/actions-parts-catalog"

export const metadata = { title: "Price Catalog · SHWURX Auto Service Center" }

export default async function PricingPage() {
  const ctx = await requirePageAccess(["quotations.edit", "settings.manage"], "Price Catalog")
  const user = await getShellUser()
  const entries = await listCatalog()

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-balance">Price Catalog</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            One fixed selling price per exact specification. Price changes need management approval and are kept as
            permanent history.
          </p>
        </header>
        <PriceCatalogClient
          entries={entries}
          canEdit={ctx.permissions.has("quotations.edit")}
          canApprove={ctx.permissions.has("settings.manage")}
          currentUserId={ctx.userId}
        />
      </div>
    </AppShell>
  )
}
