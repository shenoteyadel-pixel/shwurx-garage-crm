import { getSettings } from "@/lib/settings"
import { SettingsForm } from "@/components/settings-form"

export const metadata = { title: "Settings · SHWURX Garage" }

export default async function SettingsPage() {
  const settings = await getSettings()
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Company Settings</h1>
        <p className="text-sm text-muted-foreground">
          These details appear on every quotation, invoice, and purchase order.
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  )
}
