import { redirect } from "next/navigation"
import { getSettings } from "@/lib/settings"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { MarketingForm } from "@/components/marketing-form"

export const metadata = { title: "Marketing & Website · SHWURX Auto Service Center" }

export default async function MarketingPage() {
  const [settings, user] = await Promise.all([getSettings(), getShellUser()])
  const perms = new Set(user.permissions ?? [])
  if (!perms.has("marketing.view") && !perms.has("marketing.manage")) redirect("/")
  const canManage = perms.has("marketing.manage")

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Marketing &amp; Website</h1>
          <p className="text-sm text-muted-foreground">
            Connect analytics and advertising tools to your website. Paste the IDs your marketing platforms give you —
            no code or developer needed. Your agency can be given access to this page only.
          </p>
        </div>
        <MarketingForm settings={settings} canManage={canManage} />
      </div>
    </AppShell>
  )
}
