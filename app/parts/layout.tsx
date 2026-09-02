import { requirePageAccess } from "@/lib/rbac/context"

export default async function PartsLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess(["parts.view"], "Parts")
  return <>{children}</>
}
