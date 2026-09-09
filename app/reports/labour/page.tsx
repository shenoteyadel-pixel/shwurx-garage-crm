import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { LabourReportClient } from "@/components/labour-report-client"
import {
  DEPARTMENTS,
  classifyLabour,
  type DepartmentKey,
  type DepartmentTotal,
  type LabourReportRow,
} from "@/lib/labour-report"

export const metadata = { title: "Labour Hours · SHWURX Auto Service Center" }

function monthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

const LABOUR_KINDS = new Set(["labor", "labour"])

export default async function LabourReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const shellUser = await getShellUser()
  const supabase = await createClient()

  const def = monthRange()
  const from = sp.from || def.from
  const to = sp.to || def.to
  const toEnd = `${to}T23:59:59`

  const { data: quotations } = await supabase
    .from("quotations")
    .select(
      "id, job_id, created_at, jobs(job_number), quotation_items(kind, name, detail, category, labour_hours, labour_rate, labor)",
    )
    .gte("created_at", from)
    .lte("created_at", toEnd)
    .order("created_at", { ascending: false })

  type QItem = {
    kind: string
    name?: string | null
    detail?: string | null
    category?: string | null
    labour_hours?: number | null
    labour_rate?: number | null
    labor?: number | null
  }
  type QRow = {
    id: string
    job_id: string | null
    created_at: string
    // Supabase can type an embedded to-one relation as an array; accept both.
    jobs: { job_number?: string | null } | { job_number?: string | null }[] | null
    quotation_items: QItem[] | null
  }

  // Keep only the latest quotation per job (rows are newest-first) so multiple
  // revisions of the same job don't inflate the hours.
  const latestByJob = new Map<string, QRow>()
  for (const q of (quotations ?? []) as QRow[]) {
    const jobKey = q.job_id ?? q.id
    if (!latestByJob.has(jobKey)) latestByJob.set(jobKey, q)
  }

  const totalsMap = new Map<DepartmentKey, DepartmentTotal>()
  const jobsPerDept = new Map<DepartmentKey, Set<string>>()
  for (const d of DEPARTMENTS) {
    totalsMap.set(d.key, { key: d.key, label: d.label, hours: 0, amount: 0, lineCount: 0, jobCount: 0 })
    jobsPerDept.set(d.key, new Set())
  }

  const rows: LabourReportRow[] = []

  for (const q of latestByJob.values()) {
    const jobRel = Array.isArray(q.jobs) ? q.jobs[0] : q.jobs
    const jobNumber = jobRel?.job_number ?? "—"
    const date = String(q.created_at).slice(0, 10)
    const items = q.quotation_items ?? []

    for (const it of items) {
      if (!LABOUR_KINDS.has((it.kind ?? "").toLowerCase())) continue
      const hours = Number(it.labour_hours) || 0
      const rate = Number(it.labour_rate) || 0
      const amount = hours > 0 && rate > 0 ? hours * rate : Number(it.labor) || 0
      // Skip empty labour lines that carry neither hours nor a labour amount.
      if (hours === 0 && amount === 0) continue

      const dept = classifyLabour(it.category, it.name, it.detail)
      const t = totalsMap.get(dept)!
      t.hours += hours
      t.amount += amount
      t.lineCount += 1
      jobsPerDept.get(dept)!.add(jobNumber)

      rows.push({
        jobNumber,
        date,
        department: dept,
        description: it.name || it.detail || "Labour",
        category: it.category || "",
        hours,
        rate,
        amount,
      })
    }
  }

  for (const d of DEPARTMENTS) {
    totalsMap.get(d.key)!.jobCount = jobsPerDept.get(d.key)!.size
  }

  const departments = DEPARTMENTS.map((d) => totalsMap.get(d.key)!)
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.hours - a.hours))

  return (
    <AppShell user={shellUser}>
      <div className="mx-auto max-w-6xl">
        <LabourReportClient from={from} to={to} departments={departments} rows={rows} />
      </div>
    </AppShell>
  )
}
