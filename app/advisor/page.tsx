import { requirePageAccess } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { AdvisorChat } from "@/components/advisor/advisor-chat"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Service Advisor AI · SHWURX",
  description: "AI assistant that helps service advisors handle cars using live workshop data.",
}

export default async function AdvisorPage() {
  const ctx = await requirePageAccess(["jobs.view_all"], "Service Advisor AI")
  const shellUser = await getShellUser()

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AdvisorChat userName={ctx.name} />
      </div>
    </AppShell>
  )
}
