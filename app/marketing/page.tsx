import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { WebsiteControlCenter } from "@/components/website-control-center"
import { loadControlCenter, resolveControlCenterAccess } from "@/lib/website/control-center-data"

export const metadata = { title: "Website Control Center · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function MarketingPage() {
  const user = await getShellUser()
  const access = resolveControlCenterAccess(user.permissions ?? [])
  if (!access) redirect("/")
  const data = await loadControlCenter(access)

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Website Control Center</h1>
          <p className="text-sm text-muted-foreground">
            Edit your public website, run the blog, and manage analytics &amp; ad tracking. Each section only appears
            for staff whose role allows it.
          </p>
        </div>
        <WebsiteControlCenter data={data} />
      </div>
    </AppShell>
  )
}
