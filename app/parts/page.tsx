import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { Button, Card } from "@/components/ui"
import { PART_STATUSES } from "@/lib/constants"
import { formatCurrency, cn } from "@/lib/utils"
import { Package, ExternalLink, ScanLine } from "lucide-react"

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; show?: string }>
}) {
  const { status, show } = await searchParams
  const showAll = show === "all"
  const withParams = (next: { status?: string | null; show?: string | null }) => {
    const p = new URLSearchParams()
    const s = next.status === undefined ? status : next.status
    const sh = next.show === undefined ? (showAll ? "all" : null) : next.show
    if (s) p.set("status", s)
    if (sh) p.set("show", sh)
    const qs = p.toString()
    return qs ? `/parts?${qs}` : "/parts"
  }
  const user = await getShellUser()
  const supabase = await createClient()
  const canScan =
    user.permissions.includes("purchase_orders.manage") || user.permissions.includes("parts.view")

  let query = supabase
    .from("parts_requests")
    .select("id, part_name, quantity, status, supplier, cost, created_at, jobs!inner(id, job_number, customer_name, vehicle_make, vehicle_model, stage, approval_status)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  if (!showAll) query = query.neq("jobs.stage", "delivered")

  const { data: parts } = await query
  const rows = (parts ?? []) as any[]

  // Highlight parts whose job was just approved (needs ordering)
  const counts = Object.fromEntries(
    PART_STATUSES.map((s) => [s.value, rows.filter((r) => r.status === s.value).length]),
  )

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parts</h1>
          <p className="text-sm text-muted-foreground">
            {showAll
              ? "Showing parts for every job, including cars already delivered."
              : "Showing parts for cars still in the workshop. Delivered jobs are hidden."}
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-1 text-xs font-medium">
          <Link
            href={withParams({ show: null })}
            className={cn(
              "rounded-md px-3 py-1.5",
              !showAll ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Workshop only
          </Link>
          <Link
            href={withParams({ show: "all" })}
            className={cn(
              "rounded-md px-3 py-1.5",
              showAll ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Include delivered
          </Link>
        </div>
        {canScan && (
          <Link href="/purchasing/invoices">
            <Button variant="danger">
              <ScanLine className="h-4 w-4" /> Scan Purchase Invoice
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PART_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={withParams({ status: status === s.value ? null : s.value })}
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
                      {r.jobs?.stage === "delivered" && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          Car delivered
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
