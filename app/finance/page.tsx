import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSettings } from "@/lib/settings"
import { AppShell } from "@/components/app-shell"
import { FinanceView } from "@/components/finance-view"
import { loadFinanceReport } from "@/lib/finance"

export const metadata = { title: "Finance · SHWURX Auto Service Center" }

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const now = new Date()
  const from = sp.from || fmt(new Date(now.getFullYear(), now.getMonth(), 1))
  const to = sp.to || fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const shellUser = await getShellUser()
  const supabase = await createClient()
  const [settings, report] = await Promise.all([getSettings(), loadFinanceReport(supabase, from, to)])

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <FinanceView
          report={report}
          company={{ name: settings.legal_name || settings.company_name, trn: settings.trn, address: settings.address }}
        />
      </div>
    </AppShell>
  )
}
