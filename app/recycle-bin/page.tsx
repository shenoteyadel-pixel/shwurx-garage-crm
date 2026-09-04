import { redirect } from "next/navigation"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { listArchived } from "@/lib/recycle-bin"
import { RecycleBinClient } from "@/components/recycle-bin-client"

export const metadata = { title: "Recycle Bin · SHWURX Auto Service Center" }

export default async function RecycleBinPage() {
  const user = await getShellUser()
  // Owner-only: everyone else is sent to the Access Denied page.
  if (user.role !== "owner") redirect("/denied?from=Recycle%20Bin")

  const groups = await listArchived()

  return (
    <AppShell user={user}>
      <RecycleBinClient groups={groups} />
    </AppShell>
  )
}
