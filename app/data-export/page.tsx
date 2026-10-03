import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { createServiceClient } from "@/lib/supabase/server"
import { EXPORT_GROUPS } from "@/lib/data-export"
import { DataExportClient } from "@/components/data-export-client"

export const metadata = { title: "Download Data · SHWURX Auto Service Center" }

export default async function DataExportPage() {
  const user = await getShellUser()
  if (user.role !== "owner") redirect("/denied?from=Download%20Data")

  const svc = createServiceClient()
  const tables = EXPORT_GROUPS.flatMap((g) => g.datasets.map((d) => d.table))
  const counts = Object.fromEntries(
    await Promise.all(
      tables.map(async (t) => {
        const { count } = await svc.from(t).select("*", { count: "exact", head: true })
        return [t, count ?? 0] as const
      }),
    ),
  )

  return (
    <AppShell user={user}>
      <DataExportClient groups={EXPORT_GROUPS} counts={counts} />
    </AppShell>
  )
}
