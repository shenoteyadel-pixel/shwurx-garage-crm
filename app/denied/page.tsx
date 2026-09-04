import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"

export const metadata = { title: "Access Denied · SHWURX Garage" }

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ perm?: string; from?: string }>
}) {
  const [user, sp] = await Promise.all([getShellUser(), searchParams])

  return (
    <AppShell user={user}>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Your role ({user.role.replace(/_/g, " ")}) doesn&apos;t have permission to view
          {sp.from ? ` ${sp.from}` : " this page"}. If you believe this is a mistake, contact your workshop
          administrator.
        </p>
        <Link
          href="/crm"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to Dashboard
        </Link>
      </div>
    </AppShell>
  )
}
