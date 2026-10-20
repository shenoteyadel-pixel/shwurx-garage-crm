import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { JobCard, type JobCardData } from "@/components/job-card"
import { STAGES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { RestoreJobButton } from "@/components/restore-job-button"

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; view?: string }>
}) {
  const { stage, q, view } = await searchParams
  if (view === "deleted") return <DeletedJobs q={q} />
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
      "id, job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, vehicle_reference_image_url, cover_photo_url, stage, approval_status, created_at, updated_at",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })

  if (stage) query = query.eq("stage", stage)
  if (q) query = query.or(`customer_name.ilike.%${q}%,plate_number.ilike.%${q}%,job_number.ilike.%${q}%`)

  const { data: jobs } = await query

  const cards: JobCardData[] = (jobs ?? []).map((j: any) => ({
    ...j,
    // Explicit cover only — a parts/document photo can never become the card image.
    cover: null,
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
        <FilterChip href="/jobs?view=deleted" active={false} label="Deleted" dot="bg-red-400" />
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

async function DeletedJobs({ q }: { q?: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user!.id).maybeSingle()
  const isOwner = profile?.role === "owner"

  let query = supabase
    .from("jobs")
    .select("id, job_number, customer_name, vehicle_make, vehicle_model, plate_number, stage, deleted_at, deleted_by")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300)
  if (q) query = query.or(`customer_name.ilike.%${q}%,plate_number.ilike.%${q}%,job_number.ilike.%${q}%`)
  const { data: jobs } = await query

  const deleterIds = [...new Set((jobs ?? []).map((j: any) => j.deleted_by).filter(Boolean))] as string[]
  const { data: deleters } = deleterIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", deleterIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameOf = new Map((deleters ?? []).map((p) => [p.id, p.full_name]))

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deleted Job Cards</h1>
          <p className="text-sm text-muted-foreground">
            {(jobs ?? []).length} deleted job card{(jobs ?? []).length === 1 ? "" : "s"}.
            {isOwner ? " Restore any card to bring it back." : " Ask the owner to restore a card."}
          </p>
        </div>
        <form className="flex gap-2" action="/jobs">
          <input type="hidden" name="view" value="deleted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search customer, plate, job #"
            className="h-10 w-56 rounded-lg border border-input bg-background/60 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip href="/jobs" active={false} label="Active job cards" />
        <FilterChip href="/jobs?view=deleted" active label="Deleted" dot="bg-red-400" />
      </div>

      {!jobs?.length ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No deleted job cards.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j: any) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {j.job_number} · {[j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ") || "Vehicle"}
                  {j.plate_number ? ` · ${j.plate_number}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {j.customer_name || "No customer"} · Deleted {new Date(j.deleted_at).toLocaleString()}
                  {j.deleted_by && nameOf.get(j.deleted_by) ? ` by ${nameOf.get(j.deleted_by)}` : ""}
                </div>
              </div>
              <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">
                Deleted
              </span>
              {isOwner && <RestoreJobButton id={j.id} />}
            </li>
          ))}
        </ul>
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
