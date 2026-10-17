import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { Inbox } from "lucide-react"
import { LeadsBoard } from "@/components/leads-board"
import type { LeadRow } from "@/lib/actions-leads"
import { headers } from "next/headers"
import { after } from "next/server"
import { syncMetaLeads, lastMetaSyncStatus, explainMetaError, isMetaTokenExpired } from "@/lib/meta-leads"

const META_SYNC_WAIT_MS = 4000
import { createServiceClient } from "@/lib/supabase/server"
import { googleWebhookKey, metaConfigured, metaVerifyToken } from "@/lib/ad-leads"
import { AdSourcesCard, type AdSourceStatus } from "@/components/ad-sources-card"

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

async function loadAdSources(): Promise<AdSourceStatus[]> {
  const svc = createServiceClient()
  const origin = await siteOrigin()
  const stats = async (provider: "meta" | "google") => {
    const [{ count }, { data: last }] = await Promise.all([
      svc.from("ad_webhook_events").select("id", { count: "exact", head: true }).eq("provider", provider),
      svc
        .from("ad_webhook_events")
        .select("received_at, error")
        .eq("provider", provider)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    return { events: count ?? 0, lastAt: (last?.received_at as string) ?? null, lastError: (last?.error as string) ?? null }
  }
  const [rawMetaStats, googleStats] = await Promise.all([stats("meta"), stats("google")])
  const sync = lastMetaSyncStatus()
  const rawError = sync?.error ?? rawMetaStats.lastError
  const metaStats = rawError ? { ...rawMetaStats, lastError: explainMetaError(rawError) } : rawMetaStats
  const meta = metaConfigured()
  const metaMissing = !meta.pageToken
    ? ["META_PAGE_ACCESS_TOKEN"]
    : isMetaTokenExpired(rawError)
      ? ["META_PAGE_ACCESS_TOKEN (expired)"]
      : []
  return [
    {
      provider: "meta",
      label: "Meta (Facebook & Instagram)",
      url: `${origin}/api/webhooks/meta`,
      secretLabel: "Verify token",
      secret: metaVerifyToken(),
      ready: metaMissing.length === 0,
      missing: metaMissing,
      ...metaStats,
      steps: [
        "In developers.facebook.com open your app, add Webhooks, choose Page, and paste the URL and verify token.",
        "Subscribe to the leadgen field and connect your Facebook Page to the app.",
        "Add a token with leads_retrieval, pages_manage_ads, pages_show_list, pages_read_engagement and pages_manage_metadata as META_PAGE_ACCESS_TOKEN (and the app secret as META_APP_SECRET).",
        "Test with Meta's Lead Ads Testing Tool, then use Import existing Meta leads to pull leads submitted before setup.",
      ],
    },
    {
      provider: "google",
      label: "Google Ads lead forms",
      url: `${origin}/api/webhooks/google`,
      secretLabel: "Key",
      secret: googleWebhookKey(),
      ready: Boolean(googleWebhookKey()),
      missing: [],
      ...googleStats,
      steps: [
        "In Google Ads open the lead form asset and expand Lead delivery options.",
        "Paste the webhook URL and key, then click Send test data.",
        "Save the form. Each new submission is pushed to the CRM instantly.",
      ],
    },
  ]
}

export const metadata = { title: "Leads · SHWURX Auto Service Center" }
export const dynamic = "force-dynamic"

export default async function LeadsPage() {
  await requirePageAccess(["leads.view"], "Leads")
  const sync = syncMetaLeads()
  after(() => sync)
  await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, META_SYNC_WAIT_MS))])
  const user = await getShellUser()
  const supabase = await createClient()

  const [{ data: leadData }, { data: staffData }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, phone, email, message, service_interest, source, status, customer_id, metadata, created_at, updated_at",
      )
      .is("metadata->>deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("is_active", true)
      .neq("role", "customer")
      .order("full_name"),
  ])

  const leads = (leadData ?? []) as LeadRow[]
  const staff = (staffData ?? []).map((s) => ({
    id: s.id as string,
    name: (s.full_name as string) || (s.email as string) || "Staff",
  }))
  const canManage = user.permissions.includes("leads.manage")
  const openCount = leads.filter((l) => l.status !== "converted" && l.status !== "lost").length
  const adSources = canManage ? await loadAdSources() : null

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">
              {openCount} open lead{openCount === 1 ? "" : "s"} from the website, Meta and Google Ads
            </p>
          </div>
        </div>

        {adSources ? <AdSourcesCard sources={adSources} /> : null}

        {leads.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium text-foreground">No leads yet</p>
              <p className="text-sm text-muted-foreground">
                Contact-form and enquiry submissions from the SHWURX website will appear here
                automatically, ready to follow up and convert into customers.
              </p>
            </div>
          </Card>
        ) : (
          <LeadsBoard leads={leads} staff={staff} canManage={canManage} canDelete={canManage && user.role === "owner"} />
        )}
      </div>
    </AppShell>
  )
}
