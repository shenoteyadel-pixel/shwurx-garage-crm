import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { Card } from "@/components/ui"
import { PART_STATUSES } from "@/lib/constants"
import { formatCurrency, cn } from "@/lib/utils"
import { Package, ExternalLink } from "lucide-react"

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
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
    .from("parts_requests")
    .select("id, part_name, quantity, status, supplier, cost, created_at, jobs(id, job_number, customer_name, vehicle_make, vehicle_model, stage, approval_status)")
    .order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)

  const { data: parts } = await query
  const rows = (parts ?? []) as any[]

  // Highlight parts whose job was just approved (needs ordering)
  const counts = Object.fromEntries(
    PART_STATUSES.map((s) => [s.value, rows.filter((r) => r.status === s.value).length]),
  )

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Parts</h1>
        <p className="text-sm text-muted-foreground">
          Order, track and receive parts. Requests appear here as soon as a customer approves a job.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PART_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={status === s.value ? "/parts" : `/parts?status=${s.value}`}
            className={cn(
              "rounded-xl border p-4 transition",
              status === s.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <div className="text-2xl font-bold tabular-nums">{counts[s.value] ?? 0}</div>
            <div className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px]", s.chip)}>
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
            <Package className="h-8 w-8" />
            <p className="text-sm">No parts requests{status ? " with this status" : ""}.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const st = PART_STATUSES.find((s) => s.value === r.status) ?? PART_STATUSES[0]
              const veh = [r.jobs?.vehicle_make, r.jobs?.vehicle_model].filter(Boolean).join(" ")
              const needsOrder = r.status === "required" && r.jobs?.approval_status === "approved"
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.part_name}</span>
                      <span className="text-xs text-muted-foreground">× {r.quantity}</span>
                      {needsOrder && (
                        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                          Approved — order now
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {veh} · {r.jobs?.customer_name}
                      {r.supplier ? ` · ${r.supplier}` : ""}
                      {r.cost != null ? ` · ${formatCurrency(r.cost * r.quantity)}` : ""}
                    </div>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", st.chip)}>{st.label}</span>
                  <Link
                    href={`/jobs/${r.jobs?.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {r.jobs?.job_number} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </AppShell>
  )
}
