import { notFound } from "next/navigation"
import { createPublicClient } from "@/lib/supabase/public"
import { createServiceClient } from "@/lib/supabase/server"
import { ApprovalRequestView, type PriorApprovedItem } from "@/components/approval-request-view"
import { BrandLogo } from "@/components/brand-logo"
import { trackingPathForApproval } from "@/lib/approval-tracking"
import { alreadyApprovedKeys, approvalItemSignature, mergeApprovedItems } from "@/lib/approval-dedupe"

export const dynamic = "force-dynamic"

async function loadJobContext(jobId: string | undefined, currentRequestId: string) {
  if (!jobId) return { prior: [] as PriorApprovedItem[], paid: 0, counts: new Map<string, number>() }
  const svc = createServiceClient()

  const [{ data: requests }, { data: payments }, { data: quotation }] = await Promise.all([
    svc
      .from("approval_requests")
      .select("id, snapshot, decided_at, mode, status, approval_item_decisions(item_key, decision)")
      .eq("job_id", jobId)
      .in("status", ["approved", "partial"])
      .neq("id", currentRequestId)
      .order("decided_at", { ascending: true }),
    svc.from("payments").select("amount").eq("job_id", jobId).eq("direction", "in"),
    svc
      .from("quotations")
      .select("id, quotation_items(kind, name, description, quantity, unit_price, labour_hours, labour_rate, discount)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const approvedRequests = ((requests as any[]) ?? []).map((req) => {
    const approvedKeys = new Set(
      ((req.approval_item_decisions as any[]) ?? [])
        .filter((d) => d.decision === "approved")
        .map((d) => d.item_key as string),
    )
    const items = ((req.snapshot?.items as any[]) ?? []).filter(
      (it) => req.mode === "whole" || approvedKeys.has(it.key),
    )
    return { id: req.id as string, decided_at: (req.decided_at as string) ?? null, items }
  })

  const { merged } = mergeApprovedItems(approvedRequests)

  // Only approvals for items still on the current quotation count; a line that
  // was edited (new price, qty…) or removed is superseded and must not add up.
  const onQuotation = new Map<string, number>()
  for (const qi of ((quotation as any)?.quotation_items as any[]) ?? []) {
    const sig = approvalItemSignature(qi)
    onQuotation.set(sig, (onQuotation.get(sig) ?? 0) + 1)
  }
  const counts = new Map<string, number>()
  const current = merged.filter(({ item }) => {
    const sig = approvalItemSignature(item)
    const left = onQuotation.get(sig) ?? 0
    if (left <= 0) return false
    onQuotation.set(sig, left - 1)
    counts.set(sig, (counts.get(sig) ?? 0) + 1)
    return true
  })

  const prior: PriorApprovedItem[] = current.map(({ item, requestId, decided_at }) => ({
    key: `${requestId}:${item.key}`,
    name: String(item.name ?? "Item"),
    kind: item.kind === "labor" ? "labor" : "part",
    net: Number(item.net) || 0,
    gross: Number(item.gross) || 0,
    decided_at,
  }))

  const paid = ((payments as any[]) ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return { prior, paid, counts }
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
          alreadyApprovedKeys={alreadyApprovedKeys(((data as any).snapshot?.items as any[]) ?? [], context.counts)}
        />
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-32 text-center text-xs text-muted-foreground md:pb-8">
        Secured by SHWURX Auto Service Center CRM · This link is unique to your vehicle and legally records your decision.
      </footer>
    </div>
  )
}
