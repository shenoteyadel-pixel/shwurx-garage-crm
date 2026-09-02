import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { Card, Badge } from "@/components/ui"
import { getJobApprovals } from "@/lib/actions-approvals"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ArrowLeft, FileText, FileCheck, ReceiptText, FolderOpen } from "lucide-react"

const STATUS_CHIP: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  partial: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  superseded: "border-border bg-muted text-muted-foreground",
  expired: "border-border bg-muted text-muted-foreground",
}

export default async function DocumentCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  const { data: job } = await supabase
    .from("jobs")
    .select("id, job_number, vehicle_make, vehicle_model, vehicle_year, customer_name")
    .eq("id", id)
    .maybeSingle()
  if (!job) notFound()

  const [{ data: quotation }, { data: invoices }, approvals] = await Promise.all([
    supabase.from("quotations").select("id, total, created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("invoices").select("id, invoice_number, total, status, issue_date").eq("job_id", id).order("issue_date", { ascending: false }),
    getJobApprovals(id),
  ])

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
  const signedApprovals = approvals.filter((a) => ["approved", "partial", "rejected"].includes(a.status))

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6">
        <Link
          href={`/jobs/${id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to job
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Document Center</h1>
            <p className="text-sm text-muted-foreground">
              {job.job_number} · {vehicle} · {job.customer_name}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quotation */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quotation</h2>
          </div>
          {quotation ? (
            <Link
              href={`/jobs/${id}/quotation/print`}
              target="_blank"
              className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3 text-sm hover:bg-accent"
            >
              <div>
                <div className="font-medium">Current quotation</div>
                <div className="text-xs text-muted-foreground">{formatDate(quotation.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-primary">{formatCurrency(Number(quotation.total ?? 0))}</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">No quotation saved yet.</p>
          )}
        </Card>

        {/* Invoices */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invoices</h2>
          </div>
          {invoices && invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.map((inv: any) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}/print`}
                  target="_blank"
                  className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3 text-sm hover:bg-accent"
                >
                  <div>
                    <div className="font-mono font-medium">{inv.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">{inv.issue_date ? formatDate(inv.issue_date) : "Draft"}</div>
                  </div>
                  <span className="tabular-nums text-primary">{formatCurrency(Number(inv.total ?? 0))}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          )}
        </Card>

        {/* Approval certificates */}
        <Card className="p-5 md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Approval Certificates
            </h2>
          </div>
          {signedApprovals.length > 0 ? (
            <div className="space-y-2">
              {signedApprovals.map((a) => (
                <Link
                  key={a.id}
                  href={`/jobs/${id}/approval/${a.id}/certificate`}
                  target="_blank"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {a.kind === "additional_work" ? a.title || "Additional work" : "Quotation approval"}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">v{a.version}</span>
                    <Badge className={STATUS_CHIP[a.status] ?? STATUS_CHIP.pending}>{a.status}</Badge>
                    {a.signerName && <span className="text-xs text-muted-foreground">Signed by {a.signerName}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {a.approvedTotal != null && (
                      <span className="tabular-nums text-emerald-400">{formatCurrency(a.approvedTotal)}</span>
                    )}
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No signed approvals yet. Certificates appear here once a customer signs.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  )
}
