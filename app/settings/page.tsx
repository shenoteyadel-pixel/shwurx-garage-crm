import { getSettings } from "@/lib/settings"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { SettingsForm } from "@/components/settings-form"

export const metadata = { title: "Settings · SHWURX Auto Service Center" }

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getSettings(), getShellUser()])
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Company Settings</h1>
          <p className="text-sm text-muted-foreground">
            These details appear on every quotation, invoice, and purchase order.
          </p>
        </div>
        <SettingsForm settings={settings} />
      </div>
    </AppShell>
  )
}
