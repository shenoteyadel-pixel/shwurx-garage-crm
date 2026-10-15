import Link from "next/link"
import { RotateCcw } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { requirePageAccess } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { ComebackSearch, type ComebackSearchResult } from "@/components/comeback-search"
import { blamesAdvisor, blamesTechnician, comebackResponsibilityLabel } from "@/lib/comeback"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

type Row = {
  id: string
  job_number: string
  created_at: string
  vehicle_make: string | null
  vehicle_model: string | null
  customer_name: string | null
  comeback_of: string
  comeback_reason: string | null
  comeback_responsibility: string | null
  comeback_advisor_id: string | null
  comeback_technician_id: string | null
}

type Tally = { id: string; name: string; total: number; atFault: number }

function tally(rows: Row[], key: "comeback_advisor_id" | "comeback_technician_id", names: Map<string, string>) {
  const blame = key === "comeback_advisor_id" ? blamesAdvisor : blamesTechnician
  const map = new Map<string, Tally>()
  for (const r of rows) {
    const uid = r[key]
    if (!uid) continue
    const t = map.get(uid) ?? { id: uid, name: names.get(uid) ?? "Unknown", total: 0, atFault: 0 }
    t.total += 1
    if (blame(r.comeback_responsibility)) t.atFault += 1
    map.set(uid, t)
  }
  return [...map.values()].sort((a, b) => b.atFault - a.atFault || b.total - a.total)
}

function TallyCard({ title, rows }: { title: string; rows: Tally[] }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No comebacks yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 text-right font-medium">Comebacks</th>
              <th className="py-2 text-right font-medium">At fault</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="py-2 text-foreground">{t.name}</td>
                <td className="py-2 text-right font-mono">{t.total}</td>
                <td className="py-2 text-right font-mono font-semibold text-red-500">{t.atFault}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

const SEARCH_COLUMNS =
  "id, job_number, created_at, stage, customer_name, customer_mobile, vehicle_make, vehicle_model, plate_code, plate_number, comeback_of"

type SearchJob = Omit<ComebackSearchResult, "invoiceNumbers" | "isComeback"> & { comeback_of: string | null }

async function searchJobs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: string,
): Promise<ComebackSearchResult[]> {
  // Strip characters that have meaning inside a PostgREST or() filter.
  const q = raw.replace(/[,()%*\\:]/g, " ").trim()
  if (q.length < 2) return []
  const like = `%${q}%`
  const digits = q.replace(/\D/g, "")

  const jobFilters = [`job_number.ilike.${like}`, `plate_number.ilike.${like}`, `customer_name.ilike.${like}`]
  jobFilters.push(`customer_mobile.ilike.%${digits.length >= 3 ? digits.slice(-9) : q}%`)

  const [{ data: jobs }, { data: invoiceHits }] = await Promise.all([
    supabase
      .from("jobs")
      .select(SEARCH_COLUMNS)
      .or(jobFilters.join(","))
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("invoices").select("job_id").ilike("invoice_number", like).not("job_id", "is", null).limit(20),
  ])

  const found = new Map<string, SearchJob>(((jobs ?? []) as SearchJob[]).map((j) => [j.id, j]))
  const extraIds = [...new Set((invoiceHits ?? []).map((i) => i.job_id as string))].filter((id) => !found.has(id))
  if (extraIds.length) {
    const { data: more } = await supabase.from("jobs").select(SEARCH_COLUMNS).in("id", extraIds).is("deleted_at", null)
    for (const j of (more ?? []) as SearchJob[]) found.set(j.id, j)
  }
  if (found.size === 0) return []

  const { data: invoices } = await supabase
    .from("invoices")
    .select("job_id, invoice_number")
    .in("job_id", [...found.keys()])
  const invoicesByJob = new Map<string, string[]>()
  for (const inv of invoices ?? []) {
    const list = invoicesByJob.get(inv.job_id as string) ?? []
    list.push(inv.invoice_number as string)
    invoicesByJob.set(inv.job_id as string, list)
  }

  return [...found.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(({ comeback_of, ...j }) => ({
      ...j,
      invoiceNumbers: invoicesByJob.get(j.id) ?? [],
      isComeback: Boolean(comeback_of),
    }))
}

export default async function ComebacksPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePageAccess(["jobs.view_all"], "Comebacks")
  const user = await getShellUser()
  const supabase = await createClient()
  const query = String((await searchParams).q ?? "").trim()
  const searchResults = query ? await searchJobs(supabase, query) : null

  const { data } = await supabase
    .from("jobs")
    .select(
      "id, job_number, created_at, vehicle_make, vehicle_model, customer_name, comeback_of, comeback_reason, comeback_responsibility, comeback_advisor_id, comeback_technician_id",
    )
    .not("comeback_of", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500)
  const rows = (data ?? []) as Row[]

  const originalIds = [...new Set(rows.map((r) => r.comeback_of))]
  const staffIds = [
    ...new Set(rows.flatMap((r) => [r.comeback_advisor_id, r.comeback_technician_id]).filter(Boolean) as string[]),
  ]
  const [{ data: originals }, { data: staff }] = await Promise.all([
    originalIds.length
      ? supabase.from("jobs").select("id, job_number").in("id", originalIds)
      : Promise.resolve({ data: [] as { id: string; job_number: string }[] }),
    staffIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", staffIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const originalNumber = new Map((originals ?? []).map((o) => [o.id, o.job_number]))
  const names = new Map((staff ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]))

  return (
    <AppShell user={user}>
      <div className="mb-6 flex items-center gap-3">
        <RotateCcw className="h-6 w-6 text-amber-500" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Comebacks</h1>
          <p className="text-sm text-muted-foreground">
            Cars that returned after a job, and who was responsible for the original work.
          </p>
        </div>
      </div>

      <ComebackSearch
        query={query}
        results={searchResults}
        canCreate={ctx.permissions.has("jobs.create")}
        isOwner={ctx.role === "owner"}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <TallyCard title="Service advisors" rows={tally(rows, "comeback_advisor_id", names)} />
        <TallyCard title="Technicians" rows={tally(rows, "comeback_technician_id", names)} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Comeback</th>
              <th className="px-4 py-3 font-medium">Original</th>
              <th className="px-4 py-3 font-medium">Car</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Advisor</th>
              <th className="px-4 py-3 font-medium">Technician</th>
              <th className="px-4 py-3 font-medium">Responsible</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No comeback job cards yet. Open one from a job card with the &quot;Car came back&quot; button.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <Link href={`/jobs/${r.id}`} className="font-mono text-primary hover:underline">
                    {r.job_number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatDate(r.created_at)}</div>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/jobs/${r.comeback_of}`} className="font-mono hover:underline">
                    {originalNumber.get(r.comeback_of) ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—"}
                  <div className="text-xs text-muted-foreground">{r.customer_name}</div>
                </td>
                <td className="max-w-xs px-4 py-3 text-pretty text-muted-foreground">{r.comeback_reason ?? "—"}</td>
                <td className="px-4 py-3">{r.comeback_advisor_id ? names.get(r.comeback_advisor_id) : "—"}</td>
                <td className="px-4 py-3">{r.comeback_technician_id ? names.get(r.comeback_technician_id) : "—"}</td>
                <td className="px-4 py-3">{comebackResponsibilityLabel(r.comeback_responsibility)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  )
}
