import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { CarFlow } from "@/components/car-flow"
import { SyncVisualsButton } from "@/components/sync-visuals-button"
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
      "id, job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, lift_bay, vehicle_reference_image_url, cover_photo_url, stage, approval_status, mileage, advisor_id, technician_id, estimated_completion, created_at, updated_at",
    )
    .neq("stage", "delivered")
    .order("updated_at", { ascending: false })

  const jobs = jobsRaw ?? []

  // The Car Flow cover is ONLY the explicitly chosen cover photo. Damage,
  // parts, and document photos can never become it; jobs without a chosen
  // cover fall back to the model-aware, colour-accurate vehicle visual.
  const coverByJob = new Map<string, string>()
  for (const j of jobs) {
    if (j.cover_photo_url) coverByJob.set(j.id, j.cover_photo_url)
  }

  // Resolve advisor / technician display names.
  const staffIds = Array.from(
    new Set(jobs.flatMap((j) => [j.advisor_id, j.technician_id]).filter((v): v is string => !!v)),
  )
  const nameById = new Map<string, string>()
  if (staffIds.length) {
    const { data: staff } = await supabase.from("profiles").select("id, full_name").in("id", staffIds)
    for (const s of staff ?? []) nameById.set(s.id, s.full_name || "")
  }

  // Latest invoice per job drives the payment badge.
  const jobIds = jobs.map((j) => j.id)
  const payByJob = new Map<string, { status: string; total: number; paid: number }>()
  if (jobIds.length) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("job_id, status, total, amount_paid, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
    for (const inv of invs ?? []) {
      if (!payByJob.has(inv.job_id)) {
        payByJob.set(inv.job_id, {
          status: inv.status ?? "",
          total: Number(inv.total ?? 0),
          paid: Number(inv.amount_paid ?? 0),
        })
      }
    }
  }

  function paymentStatus(jobId: string): JobCardData["payment_status"] {
    const p = payByJob.get(jobId)
    if (!p) return "none"
    if (p.total > 0 && p.paid >= p.total) return "paid"
    if (p.paid > 0) return "partial"
    return "unpaid"
  }

  const jobCards: JobCardData[] = jobs.map((j) => ({
    ...(j as any),
    cover: coverByJob.get(j.id) ?? null,
    advisor: j.advisor_id ? nameById.get(j.advisor_id) ?? null : null,
    technician: j.technician_id ? nameById.get(j.technician_id) ?? null : null,
    payment_status: paymentStatus(j.id),
  }))

  const zoneCounts = ZONES.map((z) => ({
    zone: z,
    count: jobCards.filter((j) => z.stages.includes(j.stage)).length,
  }))

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Car Flow</h1>
          <p className="text-sm text-muted-foreground">
            Live workshop board — every vehicle by physical zone and lift bay.
          </p>
        </div>
        <SyncVisualsButton />
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
