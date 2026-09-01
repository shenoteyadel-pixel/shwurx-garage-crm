import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { CarFlow } from "@/components/car-flow"
import { ZONES } from "@/lib/constants"
import type { JobCardData } from "@/components/job-card"

export const dynamic = "force-dynamic"

export default async function FlowPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  const { data: jobsRaw } = await supabase
    .from("jobs")
    .select(
      "id, job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, lift_bay, stage, approval_status, created_at, updated_at",
    )
    .neq("stage", "delivered")
    .order("updated_at", { ascending: false })

  const jobs = jobsRaw ?? []

  const { data: photos } = await supabase
    .from("vehicle_photos")
    .select("job_id, url, created_at")
    .order("created_at", { ascending: true })
  const coverByJob = new Map<string, string>()
  for (const p of photos ?? []) {
    if (!coverByJob.has(p.job_id)) coverByJob.set(p.job_id, p.url)
  }

  const jobCards: JobCardData[] = jobs.map((j) => ({
    ...(j as any),
    cover: coverByJob.get(j.id) ?? null,
  }))

  const zoneCounts = ZONES.map((z) => ({
    zone: z,
    count: jobCards.filter((j) => z.stages.includes(j.stage)).length,
  }))

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Car Flow</h1>
        <p className="text-sm text-muted-foreground">
          Live workshop board — every vehicle by physical zone and lift bay.
        </p>
      </div>

      {/* Zone summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {zoneCounts.map(({ zone, count }) => (
          <div key={zone.key} className="rounded-lg border border-border bg-card p-3">
            <div className={`mb-1 h-1.5 w-8 rounded-full ${zone.bar}`} />
            <div className="text-2xl font-bold tabular-nums">{count}</div>
            <div className="truncate text-xs text-muted-foreground">{zone.short}</div>
          </div>
        ))}
      </div>

      <CarFlow jobs={jobCards} />
    </AppShell>
  )
}
