import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { JobCard, type JobCardData } from "@/components/job-card"
import { STAGES } from "@/lib/constants"
import { cn } from "@/lib/utils"

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>
}) {
  const { stage, q } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  let query = supabase
    .from("jobs")
    .select(
      "id, job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, stage, approval_status, created_at, updated_at, vehicle_photos(url)",
    )
    .order("updated_at", { ascending: false })

  if (stage) query = query.eq("stage", stage)
  if (q) query = query.or(`customer_name.ilike.%${q}%,plate_number.ilike.%${q}%,job_number.ilike.%${q}%`)

  const { data: jobs } = await query

  const cards: JobCardData[] = (jobs ?? []).map((j: any) => ({
    ...j,
    cover: j.vehicle_photos?.[0]?.url ?? null,
  }))

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Cards</h1>
          <p className="text-sm text-muted-foreground">{cards.length} vehicles matching your filters.</p>
        </div>
        <form className="flex gap-2" action="/jobs">
          {stage && <input type="hidden" name="stage" value={stage} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search customer, plate, job #"
            className="h-10 w-56 rounded-lg border border-input bg-background/60 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip href="/jobs" active={!stage} label="All" />
        {STAGES.map((s) => (
          <FilterChip
            key={s.key}
            href={`/jobs?stage=${s.key}`}
            active={stage === s.key}
            label={s.label}
            dot={s.dot}
          />
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No job cards found.</p>
          <Link href="/jobs/new" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Create a new job card
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </AppShell>
  )
}

function FilterChip({
  href,
  active,
  label,
  dot,
}: {
  href: string
  active: boolean
  label: string
  dot?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {label}
    </Link>
  )
}
