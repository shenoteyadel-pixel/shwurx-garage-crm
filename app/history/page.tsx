import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { VehicleVisual, BrandLogo } from "@/components/vehicle-visual"
import { UAEPlate } from "@/components/ui"
import { formatDate } from "@/lib/utils"
import { CheckCircle2, Wallet } from "lucide-react"

export const dynamic = "force-dynamic"

function formatAED(n: number | null | undefined) {
  if (n == null) return null
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  // History = delivered cars the customer has paid for.
  const { data: jobsRaw } = await supabase
    .from("jobs")
    .select(
      "id, job_number, customer_name, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, cover_photo_url, vehicle_reference_image_url, paid_at, paid_amount, payment_method",
    )
    .eq("stage", "delivered")
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false })

  const jobs = jobsRaw ?? []
  const totalCollected = jobs.reduce((s, j) => s + (Number(j.paid_amount) || 0), 0)

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">Delivered &amp; paid vehicles.</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-bold tabular-nums">{jobs.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <div className="text-xs text-muted-foreground">Total collected</div>
            <div className="text-xl font-bold tabular-nums text-emerald-400">
              {formatAED(totalCollected) ?? "AED 0.00"}
            </div>
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">No completed cars yet</p>
          <p className="text-xs text-muted-foreground">
            Delivered cars appear here once the customer has paid.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => {
            const vehicle =
              [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"
            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="flex items-center justify-between px-3 pt-2.5">
                  <span className="font-mono text-[11px] text-muted-foreground">{job.job_number}</span>
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    <Wallet className="h-3 w-3" />
                    Paid
                  </span>
                </div>

                <div className="relative mt-2 bg-gradient-to-b from-muted/40 to-card">
                  <VehicleVisual
                    coverPhoto={job.cover_photo_url}
                    referenceImage={job.vehicle_reference_image_url}
                    make={job.vehicle_make}
                    model={job.vehicle_model}
                    bodyType={job.body_type}
                    color={job.color}
                    className="h-28 w-full"
                  />
                  {(job.plate_emirate || job.plate_code || job.plate_number) && (
                    <div className="flex justify-center py-1">
                      <UAEPlate
                        emirate={job.plate_emirate}
                        code={job.plate_code}
                        number={job.plate_number}
                        className="h-6 text-[11px]"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-3 pt-2">
                  <div className="flex items-center gap-1.5">
                    <BrandLogo make={job.vehicle_make} size={20} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">{vehicle}</div>
                      <div className="truncate text-xs text-muted-foreground">{job.customer_name}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs">
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Paid</div>
                      <div className="font-medium text-emerald-400">
                        {formatAED(job.paid_amount) ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Method</div>
                      <div className="font-medium">{job.payment_method || "—"}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Delivered</div>
                      <div className="font-medium">{job.paid_at ? formatDate(job.paid_at) : "—"}</div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
