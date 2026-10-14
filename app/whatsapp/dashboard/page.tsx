import Link from "next/link"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { WA_SOURCES, WA_STATUSES } from "@/lib/whatsapp-status"
import { getWebhookStatus } from "@/lib/actions-whatsapp-webhook"
import { WebhookCard } from "@/components/whatsapp/webhook-card"

export const metadata = { title: "WhatsApp Leads Dashboard · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

const RANGES = { "7": 7, "30": 30, "90": 90 } as const

function fmtMinutes(m: number | null) {
  if (m == null) return "—"
  if (m < 60) return `${Math.round(m)} min`
  return `${(m / 60).toFixed(1)} h`
}

export default async function WhatsAppDashboard({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requirePageAccess(["whatsapp.view_all"], "WhatsApp Leads Dashboard")
  const user = await getShellUser()
  const { d } = await searchParams
  const days = RANGES[(d ?? "30") as keyof typeof RANGES] ?? 30
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const svc = createServiceClient()
  const [{ data: convs }, { data: msgs }, { data: staff }, webhook] = await Promise.all([
    svc.from("wa_conversations").select("id, assigned_to, status, lead_source, follow_up_at, created_at").gte("created_at", since),
    svc.from("wa_messages").select("conversation_id, direction, created_at, sent_by").gte("created_at", since).order("created_at"),
    svc.from("profiles").select("id, full_name").eq("is_active", true).neq("role", "customer"),
    getWebhookStatus(),
  ])

  const leads = convs ?? []
  const names = new Map((staff ?? []).map((s) => [s.id as string, (s.full_name as string) || "Staff"]))

  const firstIn = new Map<string, number>()
  const firstReply = new Map<string, number>()
  for (const m of msgs ?? []) {
    const t = new Date(m.created_at).getTime()
    if (m.direction === "in" && !firstIn.has(m.conversation_id)) firstIn.set(m.conversation_id, t)
    if (m.direction === "out" && firstIn.has(m.conversation_id) && !firstReply.has(m.conversation_id)) firstReply.set(m.conversation_id, t)
  }
  const responseMins = (ids: string[]) => {
    const vals = ids.filter((id) => firstReply.has(id)).map((id) => (firstReply.get(id)! - firstIn.get(id)!) / 60_000)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const now = Date.now()
  const won = leads.filter((l) => l.status === "won").length
  const unassigned = leads.filter((l) => !l.assigned_to && l.status !== "won" && l.status !== "lost").length
  const overdue = leads.filter((l) => l.follow_up_at && new Date(l.follow_up_at).getTime() < now && l.status !== "won" && l.status !== "lost").length

  const byAdvisor = new Map<string, typeof leads>()
  for (const l of leads) {
    const key = l.assigned_to ?? "__none"
    byAdvisor.set(key, [...(byAdvisor.get(key) ?? []), l])
  }
  const advisorRows = [...byAdvisor.entries()]
    .map(([id, ls]) => ({
      name: id === "__none" ? "Unassigned" : names.get(id) ?? "Former staff",
      total: ls.length,
      won: ls.filter((l) => l.status === "won").length,
      lost: ls.filter((l) => l.status === "lost").length,
      response: responseMins(ls.map((l) => l.id)),
    }))
    .sort((a, b) => b.total - a.total)

  const funnel = WA_STATUSES.map((s) => ({ ...s, count: leads.filter((l) => l.status === s.value).length }))
  const sources = Object.entries(WA_SOURCES).map(([k, label]) => ({ label, count: leads.filter((l) => l.lead_source === k).length }))
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))

  const kpis = [
    { label: "Leads", value: String(leads.length) },
    { label: "Conversion", value: leads.length ? `${Math.round((won / leads.length) * 100)}%` : "—" },
    { label: "Avg first response", value: fmtMinutes(responseMins(leads.map((l) => l.id))) },
    { label: "Unassigned open", value: String(unassigned) },
    { label: "Overdue follow-ups", value: String(overdue) },
  ]

  return (
    <AppShell user={user}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp Leads Dashboard</h1>
            <p className="text-sm text-muted-foreground">Leads first seen in the last {days} days</p>
          </div>
          <nav className="flex gap-1 rounded-lg bg-secondary p-1 text-xs" aria-label="Date range">
            {Object.keys(RANGES).map((r) => (
              <Link
                key={r}
                href={`/whatsapp/dashboard?d=${r}`}
                aria-current={String(days) === r ? "page" : undefined}
                className={String(days) === r ? "rounded-md bg-background px-3 py-1 font-medium text-foreground" : "px-3 py-1 text-muted-foreground hover:text-foreground"}
              >
                {r} days
              </Link>
            ))}
          </nav>
        </div>

        <WebhookCard status={webhook} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpis.map((k) => (
            <Card key={k.label} className="flex flex-col gap-1 p-4">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-xl font-semibold text-foreground">{k.value}</span>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
            {funnel.map((f) => (
              <div key={f.value} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 text-muted-foreground">{f.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(f.count / maxFunnel) * 100}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-foreground">{f.count}</span>
              </div>
            ))}
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">Lead source</h2>
            {sources.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="tabular-nums text-foreground">{s.count}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Advisor performance</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Advisor</th>
                <th className="p-3 text-right font-medium">Leads</th>
                <th className="p-3 text-right font-medium">Won</th>
                <th className="p-3 text-right font-medium">Lost</th>
                <th className="p-3 text-right font-medium">Conversion</th>
                <th className="p-3 text-right font-medium">Avg first response</th>
              </tr>
            </thead>
            <tbody>
              {advisorRows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No WhatsApp leads in this period.</td></tr>
              )}
              {advisorRows.map((r) => (
                <tr key={r.name} className="border-b border-border last:border-0">
                  <td className="p-3 text-foreground">{r.name}</td>
                  <td className="p-3 text-right tabular-nums">{r.total}</td>
                  <td className="p-3 text-right tabular-nums">{r.won}</td>
                  <td className="p-3 text-right tabular-nums">{r.lost}</td>
                  <td className="p-3 text-right tabular-nums">{r.total ? `${Math.round((r.won / r.total) * 100)}%` : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{fmtMinutes(r.response)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  )
}
