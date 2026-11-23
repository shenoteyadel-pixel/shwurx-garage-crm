import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Card, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FREE_BADGE, isFree, warrantyLabel } from "@/lib/invoice-line"
import { InvoiceActions } from "@/components/invoice-actions"
import { InvoiceComments } from "@/components/invoice-comments"
import { PaymentReceiptUpload } from "@/components/payment-receipt-upload"
import { loadInvoiceComments } from "@/lib/invoice-comments"
import { getSessionContext } from "@/lib/rbac/context"
import { ArrowLeft, Pencil, Printer, UserRound } from "lucide-react"

const STATUS: Record<string, string> = {
  draft: "border-neutral-500/30 bg-neutral-500/15 text-neutral-300",
  unpaid: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  partial: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/15 text-red-300",
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ already?: string }>
}) {
  const { id } = await params
  const { already } = await searchParams
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: inv } = await supabase
    .from("invoices")
    .select("*, jobs(job_number), invoice_items(*), payments(*)")
    .eq("id", id)
    .maybeSingle()
  if (!inv) notFound()
  const [comments, ctx, creatorRes] = await Promise.all([
    loadInvoiceComments([id]),
    getSessionContext(),
    inv.created_by
      ? supabase.from("profiles").select("full_name").eq("id", inv.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const creatorName = (creatorRes.data as { full_name: string | null } | null)?.full_name || "Unknown user"
  const isOwner = ctx?.role === "owner"
  const canRecordPayments = ctx?.permissions.has("payments.record") ?? false

  const items = ((inv.invoice_items ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
  const payments = ((inv.payments ?? []) as any[]).filter((p) => p.direction === "in")
  const balance = (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0)

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link href="/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Invoices
        </Link>
        <Link
          href={`/invoices/${id}/print`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Printer className="h-4 w-4" /> Print / PDF
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight">{inv.invoice_number}</h1>
            <Badge className={STATUS[inv.status] ?? STATUS.unpaid}>{inv.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {inv.customer_name}
            {inv.plate ? ` · ${inv.plate}` : ""}
            {(inv as any).jobs?.job_number ? ` · Job ${(inv as any).jobs.job_number}` : ""}
            {" · "}Issued {formatDate(inv.issue_date)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Created by <span className="font-medium text-foreground">{creatorName}</span>
            {inv.created_at ? ` on ${formatDate(inv.created_at)}` : ""}
          </p>
        </div>
        {isOwner && inv.status !== "cancelled" && (
          <Link
            href={`/invoices/${id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Pencil className="h-4 w-4" /> Edit Invoice
          </Link>
        )}
      </div>

      {already && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed"
        >
          This job is already invoiced as <span className="font-mono font-semibold">{inv.invoice_number}</span>, created by{" "}
          <span className="font-semibold">{creatorName}</span>.{" "}
          {isOwner ? "Edit or cancel it below instead of creating a new one." : "Ask the owner to edit or cancel it if it needs changes."}
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Unit</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div>{it.description}</div>
                    {isFree(it.billing_type) && (
                      <div className="mt-1 text-xs text-primary">
                        {FREE_BADGE[it.billing_type as "satisfaction" | "warranty"]}
                        {it.free_reason ? ` · ${it.free_reason}` : ""}
                      </div>
                    )}
                    {warrantyLabel(it.warranty_value, it.warranty_unit) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {warrantyLabel(it.warranty_value, it.warranty_unit)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{it.kind}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(it.quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {isFree(it.billing_type) ? (
                      <span className="font-semibold text-primary">FREE</span>
                    ) : (
                      formatCurrency(it.line_total)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-border p-4">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <Row label="Parts" value={formatCurrency(inv.parts_total)} />
            <Row label="Labour" value={formatCurrency(inv.labour_total)} />
            {Number(inv.discount) > 0 && <Row label="Discount" value={`− ${formatCurrency(inv.discount)}`} />}
            <Row label="Subtotal" value={formatCurrency(inv.subtotal)} />
            <Row label={`VAT (${inv.vat_rate}%)`} value={formatCurrency(inv.vat_amount)} />
            <div className="flex items-center justify-between border-t border-border pt-2 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(inv.total)}</span>
            </div>
            <Row label="Paid" value={formatCurrency(inv.amount_paid)} />
            <div className="flex items-center justify-between font-medium">
              <span className="text-muted-foreground">Balance</span>
              <span className={`tabular-nums ${balance > 0.01 ? "text-amber-400" : "text-emerald-400"}`}>
                {formatCurrency(balance)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {payments.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Payments received</div>
          <div className="space-y-1.5 text-sm">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {formatDate(p.paid_at)} · {p.method} {p.reference ? `· ${p.reference}` : ""}
                </span>
                <div className="flex items-center gap-3">
                  <PaymentReceiptUpload
                    invoiceId={id}
                    paymentId={p.id}
                    receiptPath={p.receipt_path ?? null}
                    canUpload={canRecordPayments}
                  />
                  <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <InvoiceComments
        invoiceId={id}
        comments={comments}
        currentUserId={ctx?.userId ?? null}
        isOwner={isOwner}
      />

      <InvoiceActions
        invoiceId={id}
        isOwner={isOwner}
        status={inv.status}
        balance={balance}
        paymentLinkUrl={inv.payment_link_url}
        paymentLinkLabel={inv.payment_link_label}
        paymentLinkEnabled={inv.payment_link_enabled}
        publicToken={inv.public_token}
      />
      </div>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}
