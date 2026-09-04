import Link from "next/link"
import { redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { PermissionMatrix } from "@/components/admin/permission-matrix"
import { ArrowLeft } from "lucide-react"

export const metadata = { title: "Permission Matrix · SHWURX Auto Service Center" }

export default async function PermissionsMatrixPage() {
  const [shellUser, ctx] = await Promise.all([getShellUser(), getSessionContext()])
  if (!ctx!.permissions.has("permissions.manage")) redirect("/denied?from=Permission%20Matrix")

  const svc = createServiceClient()
  const { data: rows } = await svc.from("role_permissions").select("role, permission, allowed")

  return (
    <AppShell user={shellUser}>
      <div className="mb-6">
        <Link href="/users" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Permission Matrix</h1>
        <p className="text-sm text-muted-foreground">
          Toggle the base permissions for each role. Per-user overrides (set on the Users page) take priority over
          these defaults.
        </p>
      </div>
      <PermissionMatrix rows={rows ?? []} />
    </AppShell>
  )
}
