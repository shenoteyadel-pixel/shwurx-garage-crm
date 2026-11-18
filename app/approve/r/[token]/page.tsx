import { notFound } from "next/navigation"
import { createPublicClient } from "@/lib/supabase/public"
import { createServiceClient } from "@/lib/supabase/server"
import { ApprovalRequestView, type PriorApprovedItem } from "@/components/approval-request-view"
import { BrandLogo } from "@/components/brand-logo"
import { trackingPathForApproval } from "@/lib/approval-tracking"

export const dynamic = "force-dynamic"

async function loadJobContext(jobId: string | undefined, currentRequestId: string) {
  if (!jobId) return { prior: [] as PriorApprovedItem[], paid: 0 }
  const svc = createServiceClient()

  const [{ data: requests }, { data: payments }] = await Promise.all([
    svc
      .from("approval_requests")
      .select("id, snapshot, decided_at, mode, status, approval_item_decisions(item_key, decision)")
      .eq("job_id", jobId)
      .in("status", ["approved", "partial"])
      .neq("id", currentRequestId)
      .order("decided_at", { ascending: true }),
    svc.from("payments").select("amount").eq("job_id", jobId).eq("direction", "in"),
  ])

  const prior: PriorApprovedItem[] = []
  for (const req of (requests as any[]) ?? []) {
    const approvedKeys = new Set(
      ((req.approval_item_decisions as any[]) ?? [])
        .filter((d) => d.decision === "approved")
        .map((d) => d.item_key as string),
    )
    for (const it of (req.snapshot?.items as any[]) ?? []) {
      if (req.mode !== "whole" && !approvedKeys.has(it.key)) continue
      prior.push({
        key: `${req.id}:${it.key}`,
        name: String(it.name ?? "Item"),
        kind: it.kind === "labor" ? "labor" : "part",
        net: Number(it.net) || 0,
        gross: Number(it.gross) || 0,
        decided_at: req.decided_at ?? null,
      })
    }
  }

  const paid = ((payments as any[]) ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return { prior, paid }
}

export default async function ApproveRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc("get_approval_by_token", { p_token: token })

  if (error || !data) notFound()

  const [trackingPath, context] = await Promise.all([
    trackingPathForApproval({ kind: "request", token }),
    loadJobContext((data as any).job?.id, (data as any).id),
  ])

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-4">
          <BrandLogo className="h-10" />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Repair Approval</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 md:pb-10">
        <ApprovalRequestView
          token={token}
          data={data as any}
          trackingPath={trackingPath}
          priorApproved={context.prior}
          alreadyPaid={context.paid}
        />
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-32 text-center text-xs text-muted-foreground md:pb-8">
        Secured by SHWURX Auto Service Center CRM · This link is unique to your vehicle and legally records your decision.
      </footer>
    </div>
  )
}
