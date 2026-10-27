import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { SubscriptionsView, type SubscriptionRow } from "@/components/subscriptions-view"

export const metadata = { title: "Subscriptions & Renewals · SHWURX Auto Service Center" }

export default async function SubscriptionsPage() {
  await requirePageAccess(["subscriptions.manage", "subscriptions.approve", "subscriptions.view_assigned"], "Subscriptions & Renewals")
  const supabase = await createClient()
  const [shellUser, canManage, canApprove, subsRes, staffRes, pendingRes] = await Promise.all([
    getShellUser(),
    can("subscriptions.manage"),
    can("subscriptions.approve"),
    supabase
      .from("subscriptions")
      .select(
        "id, service_name, category, vendor, billing_cycle, custom_cycle_days, amount, currency, fx_rate_to_aed, vat_rate, amount_includes_vat, next_due_date, renewal_type, owner_id, criticality, status, resolved_due_date, billing_portal_url, portal_verified_at",
      )
      .order("next_due_date"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).neq("role", "customer").order("full_name"),
    supabase.from("subscription_payments").select("subscription_id").eq("status", "pending_confirmation"),
  ])

  const staff = (staffRes.data ?? []).map((s) => ({ id: s.id as string, name: (s.full_name as string) || "Unnamed" }))
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const pending = new Set((pendingRes.data ?? []).map((p) => p.subscription_id as string))

  const rows: SubscriptionRow[] = (subsRes.data ?? []).map((s) => ({
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
    next_due_date: String(s.next_due_date).slice(0, 10),
    renewal_type: s.renewal_type,
    owner: s.owner_id ? (names.get(s.owner_id) ?? "") : "",
    criticality: s.criticality,
    status: s.status,
    resolved_due_date: s.resolved_due_date ? String(s.resolved_due_date).slice(0, 10) : null,
    portalReady: !!(s.billing_portal_url && s.portal_verified_at),
    pendingPayment: pending.has(s.id),
  }))

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <SubscriptionsView rows={rows} staff={staff} canManage={canManage} canApprove={canApprove} />
      </div>
    </AppShell>
  )
}
