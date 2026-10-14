import { Suspense } from "react"
import Link from "next/link"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { WhatsAppInbox } from "@/components/whatsapp/inbox"
import { sendingEnabled } from "@/lib/d360"

export const metadata = { title: "WhatsApp Inbox · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function WhatsAppPage() {
  await requirePageAccess(["whatsapp.view_own", "whatsapp.view_all"], "WhatsApp Inbox")
  const user = await getShellUser()
  const canDashboard = user.permissions.includes("whatsapp.view_all")

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-balance">WhatsApp Inbox</h1>
            <p className="text-sm text-muted-foreground">Claim new leads, reply within 24 hours, and track every chat to a sale.</p>
          </div>
          {canDashboard && (
            <Link href="/whatsapp/dashboard" className="text-sm font-medium text-primary hover:underline">
              Lead dashboard
            </Link>
          )}
        </div>
        <Suspense>
          <WhatsAppInbox sendingLive={sendingEnabled()} />
        </Suspense>
      </div>
    </AppShell>
  )
}
