import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess, can } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { ContinuityView, type MonitorRow, type IncidentRow, type JobRunRow, type OverdueRow } from "@/components/continuity-view"
import { dubaiToday, grossCycleAED } from "@/lib/subscriptions"

export const metadata = { title: "Critical Services · SHWURX Auto Service Center" }

export default async function ContinuityPage() {
  await requirePageAccess(["continuity.view"], "Critical Services")
  const supabase = await createClient()
  const [shellUser, canApprove, monRes, incRes, runRes, subRes] = await Promise.all([
    getShellUser(),
    can("subscriptions.approve"),
    supabase
      .from("service_monitors")
      .select("id, name, kind, provider, target_url, job_name, freshness_hours, criticality, subscription_id, escalation_contacts, recovery_instructions, enabled, last_status, last_checked_at, last_success_at, last_error, consecutive_failures")
      .order("name"),
    supabase.from("service_incidents").select("id, monitor_id, cause, summary, opened_at, resolved_at").order("opened_at", { ascending: false }).limit(30),
    supabase.from("scheduled_job_runs").select("id, job, status, started_at, finished_at, detail").order("started_at", { ascending: false }).limit(30),
    supabase
      .from("subscriptions")
      .select("id, service_name, next_due_date, status, criticality, amount, currency, fx_rate_to_aed, vat_rate, amount_includes_vat, billing_cycle, custom_cycle_days, service_url, billing_portal_url")
      .order("service_name"),
  ])

  const subs = new Map((subRes.data ?? []).map((s) => [s.id as string, s]))
  const monitors: MonitorRow[] = (monRes.data ?? []).map((m) => {
    const sub = m.subscription_id ? subs.get(m.subscription_id) : undefined
    return {
      links: monitorLinks(m.kind, m.target_url, sub?.service_url ?? null, m.provider),
      id: m.id,
      name: m.name,
      kind: m.kind,
      target: m.target_url ?? m.job_name ?? (m.provider ? PROVIDER_LABEL[m.provider] ?? m.provider : ""),
      criticality: m.criticality,
      enabled: !!m.enabled,
      last_status: m.last_status,
      last_checked_at: m.last_checked_at,
      last_success_at: m.last_success_at,
      last_error: m.last_error ?? "",
      consecutive_failures: m.consecutive_failures ?? 0,
      escalation_contacts: m.escalation_contacts ?? "",
      recovery_instructions: m.recovery_instructions ?? "",
      subscription: sub
        ? {
            id: sub.id as string,
            name: sub.service_name as string,
            next_due_date: String(sub.next_due_date).slice(0, 10),
            amount: Number(sub.amount ?? 0),
            currency: (sub.currency as string) || "AED",
            amount_aed: grossCycleAED({
              amount: Number(sub.amount ?? 0),
              fx_rate_to_aed: Number(sub.fx_rate_to_aed ?? 1),
              vat_rate: Number(sub.vat_rate ?? 0),
              amount_includes_vat: !!sub.amount_includes_vat,
            }),
            billing_cycle: sub.billing_cycle as string,
            custom_cycle_days: (sub.custom_cycle_days as number | null) ?? null,
            billing_portal_url: (sub.billing_portal_url as string | null) ?? null,
            overdue: ["active", "pending_verification"].includes(sub.status as string) && String(sub.next_due_date).slice(0, 10) < dubaiToday(),
          }
        : null,
    }
  })
  const subscriptionOptions = (subRes.data ?? [])
    .filter((s) => s.status !== "cancelled")
    .map((s) => ({ id: s.id as string, name: s.service_name as string }))
  const names = new Map(monitors.map((m) => [m.id, m.name]))
  const incidents: IncidentRow[] = (incRes.data ?? []).map((i) => ({
    id: i.id,
    monitor: names.get(i.monitor_id) ?? "Monitor",
    cause: i.cause,
    summary: i.summary,
    opened_at: i.opened_at,
    resolved_at: i.resolved_at,
  }))
  const runs: JobRunRow[] = (runRes.data ?? []).map((r) => ({
    id: r.id,
    job: r.job,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    ...runLog(r.detail),
  }))
  const today = dubaiToday()
  const overdue: OverdueRow[] = (subRes.data ?? [])
    .filter((s) => ["active", "pending_verification"].includes(s.status as string) && String(s.next_due_date).slice(0, 10) < today)
    .map((s) => ({ id: s.id as string, name: s.service_name as string, next_due_date: String(s.next_due_date).slice(0, 10), criticality: s.criticality as string }))
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <ContinuityView monitors={monitors} incidents={incidents} runs={runs} overdue={overdue} canApprove={canApprove} subscriptionOptions={subscriptionOptions} />
      </div>
    </AppShell>
  )
}

const PROVIDER_LABEL: Record<string, string> = {
  whatsapp: "360dialog API",
  resend: "Resend API",
  stripe: "Stripe API",
  blob: "Vercel Blob",
  meta: "Meta Marketing API",
  google_ads: "Google Ads API",
  carsxe: "CarsXE API",
}

const PROVIDER_LINKS: Record<string, MonitorRow["links"]> = {
  whatsapp: [
    { label: "360dialog hub", href: "https://hub.360dialog.com/", external: true },
    { label: "Billing", href: "https://hub.360dialog.com/dashboard/billing", external: true },
  ],
  resend: [
    { label: "Resend dashboard", href: "https://resend.com/emails", external: true },
    { label: "Domains", href: "https://resend.com/domains", external: true },
    { label: "Billing", href: "https://resend.com/settings/billing", external: true },
  ],
  stripe: [
    { label: "Stripe dashboard", href: "https://dashboard.stripe.com/", external: true },
    { label: "API keys", href: "https://dashboard.stripe.com/apikeys", external: true },
  ],
  blob: [{ label: "Vercel Storage", href: "https://vercel.com/dashboard/stores", external: true }],
  meta: [
    { label: "Ads Manager", href: "https://adsmanager.facebook.com/", external: true },
    { label: "Business settings", href: "https://business.facebook.com/settings", external: true },
    { label: "Billing", href: "https://business.facebook.com/billing_hub", external: true },
  ],
  google_ads: [
    { label: "Google Ads", href: "https://ads.google.com/", external: true },
    { label: "Billing", href: "https://ads.google.com/aw/billing/summary", external: true },
    { label: "AI Marketing Manager", href: "/ai-marketing", external: false },
  ],
  carsxe: [{ label: "CarsXE dashboard", href: "https://api.carsxe.com/dashboard", external: true }],
}

/** Where staff go to inspect or fix each monitored system. */
function monitorLinks(kind: string, targetUrl: string | null, serviceUrl: string | null, provider: string | null): MonitorRow["links"] {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1] ?? "_"
  const sb = `https://supabase.com/dashboard/project/${ref}`
  const links: MonitorRow["links"] = []
  switch (kind) {
    case "http":
      if (targetUrl) links.push({ label: "Open site", href: targetUrl, external: true })
      break
    case "auth":
      links.push({ label: "Users & sign-in", href: `${sb}/auth/users`, external: true })
      break
    case "database":
      links.push({ label: "Database", href: `${sb}/database/tables`, external: true })
      break
    case "backup":
      links.push({ label: "Backup runs", href: "#runs-h", external: false })
      links.push({ label: "Supabase backups", href: `${sb}/database/backups/scheduled`, external: true })
      break
    case "capacity":
      links.push({ label: "Usage & limits", href: "https://supabase.com/dashboard/org/_/usage", external: true })
      break
    case "scheduled_job":
      links.push({ label: "Run history", href: "#runs-h", external: false })
      break
    case "provider":
      links.push(...(PROVIDER_LINKS[provider ?? ""] ?? []))
      break
  }
  if (serviceUrl && /^https?:\/\//i.test(serviceUrl) && !links.some((l) => l.href === serviceUrl)) {
    links.push({ label: "Service dashboard", href: serviceUrl, external: true })
  }
  return links
}

const LOG_KEYS: Record<string, string> = {
  trigger: "Trigger",
  checked: "Checked",
  due: "Due",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  retried: "Retried",
  down: "Down",
  opened: "Incidents opened",
  resolved: "Incidents resolved",
  tables: "Tables",
  total_rows: "Rows",
  verified: "Verified",
  manifest: "Manifest",
}

/** Turns a run's JSON detail into readable log lines. Only known, non-secret fields are shown. */
function runLog(detail: unknown): { log: string[]; error: string } {
  const d = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {}
  const log: string[] = []
  for (const [key, label] of Object.entries(LOG_KEYS)) {
    const v = d[key]
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") log.push(`${label}: ${typeof v === "boolean" ? (v ? "yes" : "no") : v}`)
  }
  if (typeof d.total_bytes === "number") log.push(`Size: ${(d.total_bytes / 1024).toFixed(0)} KB`)
  if (typeof d.duration_ms === "number") log.push(`Duration: ${(d.duration_ms / 1000).toFixed(1)}s`)
  if (Array.isArray(d.results)) {
    for (const r of d.results as { monitor?: string; status?: string; error?: string }[]) {
      if (r?.monitor) log.push(`${r.monitor}: ${r.status ?? "?"}${r.error ? ` (${String(r.error).slice(0, 160)})` : ""}`)
    }
  }
  if (Array.isArray(d.warnings)) for (const w of d.warnings.slice(0, 10)) log.push(`Warning: ${String(w).slice(0, 160)}`)
  const raw = d.error ?? d.remindersError ?? d.monitorError
  let error = typeof raw === "string" ? raw.slice(0, 600) : ""
  if (!error && Array.isArray(d.failures) && d.failures.length) {
    error = (d.failures as { table?: string; error?: string }[]).map((f) => `${f.table}: ${f.error}`).join("; ").slice(0, 600)
  }
  return { log, error }
}
