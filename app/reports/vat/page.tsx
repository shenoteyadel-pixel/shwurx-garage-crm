import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSettings } from "@/lib/settings"
import { AppShell } from "@/components/app-shell"
import { VatReportView } from "@/components/vat-report-view"
import { loadVatReport, currentQuarter } from "@/lib/vat-report"

export const metadata = { title: "VAT Return · SHWURX Auto Service Center" }

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const shellUser = await getShellUser()
  const supabase = await createClient()
  const q = currentQuarter()
  const from = sp.from || q.from
  const to = sp.to || q.to

  const [settings, report] = await Promise.all([getSettings(), loadVatReport(supabase, from, to)])

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <VatReportView
          report={report}
          company={{ name: settings.legal_name || settings.company_name, trn: settings.trn, address: settings.address }}
        />
      </div>
    </AppShell>
  )
}
