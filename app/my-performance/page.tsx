import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { requirePageAccess } from "@/lib/rbac/context"
import { AdvisorPerformanceView } from "@/components/advisor-performance-view"
import { loadPerformanceView } from "@/lib/advisor-performance-page"

export const metadata = { title: "My Performance · SHWURX Auto Service Center" }

export default async function MyPerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requirePageAccess(["quotations.edit"], "My Performance")
  const user = await getShellUser()
  const { month } = await searchParams
  const props = await loadPerformanceView({ mode: "self", userId: ctx.userId, userName: ctx.name, month })

  return (
    <AppShell user={user}>
      <AdvisorPerformanceView {...props} />
    </AppShell>
  )
}
