import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can, getSessionContext } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { SubscriptionDetail, type DetailData } from "@/components/subscription-detail"

export const metadata = { title: "Subscription · SHWURX Auto Service Center" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "")

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess(["subscriptions.manage", "subscriptions.approve", "subscriptions.view_assigned"], "Subscriptions & Renewals")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const [session, shellUser, canManage, canApprove, subRes, staffRes, payRes, attRes, remRes  ] = await Promise.all([
    getSessionContext(),
    getShellUser(),
    can("subscriptions.manage"),
    can("subscriptions.approve"),
    supabase.from("subscriptions").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).neq("role", "customer").order("full_name"),
    supabase
      .from("subscription_payments")
      .select("id, due_date, amount, currency, paid_on, method, transaction_ref, receipt_path, invoice_path, status, confirmation_source, note, recorded_by, recorded_by_name, recorded_at, decided_by_name, decided_at, decision_note")
      .eq("subscription_id", id)
      .order("recorded_at", { ascending: false }),
    supabase.from("subscription_attachments").select("id, kind, file_name, uploaded_by_name, created_at, payment_id").eq("subscription_id", id).order("created_at", { ascending: false }),
    supabase.from("subscription_reminders").select("id, due_date, stage, channel, status, attempts, last_error, created_at, escalated").eq("subscription_id", id).order("created_at", { ascending: false }).limit(40),
  ])

  const s = subRes.data
  if (!s) notFound()

  const staff = (staffRes.data ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) || "Unnamed" }))
  const ownerName = s.owner_id ? (staff.find((p) => p.id === s.owner_id)?.name ?? "") : ""

  const data: DetailData = {
    sub: {
      id: s.id,
      service_name: s.service_name,
      category: s.category,
      vendor: s.vendor ?? "",
      billing_cycle: s.billing_cycle,
      custom_cycle_days: s.custom_cycle_days,
      amount: Number(s.amount) || 0,
      currency: s.currency,
      fx_rate_to_aed: Number(s.fx_rate_to_aed) || 1,
      vat_rate: Number(s.vat_rate) || 0,
      amount_includes_vat: !!s.amount_includes_vat,
      next_due_date: day(s.next_due_date),
      status: s.status,
      resolved_due_date: s.resolved_due_date ? day(s.resolved_due_date) : null,
      resolved_reason: s.resolved_reason ?? "",
      criticality: s.criticality,
      renewal_type: s.renewal_type,
      owner: ownerName,
      billing_portal_url: s.billing_portal_url ?? "",
      portal_verified_at: s.portal_verified_at ?? null,
      verification_source: s.verification_source ?? "",
    },
    form: {
      id: s.id,
      service_name: s.service_name ?? "",
      category: s.category,
      vendor: s.vendor ?? "",
      account_reference: s.account_reference ?? "",
      service_url: s.service_url ?? "",
      billing_portal_url: s.billing_portal_url ?? "",
      billing_cycle: s.billing_cycle,
      custom_cycle_days: s.custom_cycle_days ? String(s.custom_cycle_days) : "",
      amount: String(s.amount ?? ""),
      currency: s.currency,
      fx_rate_to_aed: String(s.fx_rate_to_aed ?? "1"),
      vat_rate: String(s.vat_rate ?? "0"),
      amount_includes_vat: !!s.amount_includes_vat,
      next_due_date: day(s.next_due_date),
      renewal_type: s.renewal_type,
      auto_renew: !!s.auto_renew,
      payment_method_label: s.payment_method_label ?? "",
      owner_id: s.owner_id ?? "",
      viewer_ids: (s.viewer_ids as string[]) ?? [],
      department: s.department ?? "",
      criticality: s.criticality,
      notes: s.notes ?? "",
      status: s.status,
    },
    payments: (payRes.data ?? []).map((p) => ({
      id: p.id,
      due_date: day(p.due_date),
      amount: Number(p.amount) || 0,
      currency: p.currency,
      paid_on: day(p.paid_on),
      method: p.method,
      transaction_ref: p.transaction_ref ?? "",
      hasReceipt: !!p.receipt_path,
      hasInvoice: !!p.invoice_path,
      status: p.status,
      confirmation_source: p.confirmation_source ?? "",
      note: p.note ?? "",
      recorded_by: p.recorded_by ?? "",
      recorded_by_name: p.recorded_by_name ?? "",
      recorded_at: p.recorded_at,
      decided_by_name: p.decided_by_name ?? "",
      decided_at: p.decided_at ?? null,
      decision_note: p.decision_note ?? "",
    })),
    attachments: (attRes.data ?? []).map((a) => ({
      id: a.id,
      kind: a.kind,
      file_name: a.file_name ?? "File",
      uploaded_by_name: a.uploaded_by_name ?? "",
      created_at: a.created_at,
    })),
    reminders: (remRes.data ?? []).map((r) => ({
      id: r.id,
      due_date: day(r.due_date),
      stage: r.stage,
      channel: r.channel,
      status: r.status,
      attempts: r.attempts,
      last_error: r.last_error ?? "",
      created_at: r.created_at,
      escalated: !!r.escalated,
    })),
  }

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-5xl">
        <SubscriptionDetail data={data} staff={staff} canManage={canManage} canApprove={canApprove} currentUserId={session?.userId ?? ""} isOwner={session?.role === "owner"} />
      </div>
    </AppShell>
  )
}
