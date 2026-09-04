import { notFound } from "next/navigation"
import { createPublicClient } from "@/lib/supabase/public"
import { ApprovalRequestView } from "@/components/approval-request-view"
import { Wrench } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ApproveRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc("get_approval_by_token", { p_token: token })

  if (error || !data) notFound()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">
              SHWURX <span className="text-primary">Auto Service Center</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Repair Approval</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <ApprovalRequestView token={token} data={data as any} />
      </main>
      <footer className="mx-auto max-w-2xl px-4 py-8 text-center text-xs text-muted-foreground">
        Secured by SHWURX Auto Service Center CRM · This link is unique to your vehicle and legally records your decision.
      </footer>
    </div>
  )
}
