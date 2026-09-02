import { requirePageAccess } from "@/lib/rbac/context"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["settings.manage"], "Settings")
  return <>{children}</>
}
