import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { StatCard } from "@/components/stat-card"
import { StageBarChart, RevenueAreaChart } from "@/components/dashboard-charts"
import { CarFlow } from "@/components/car-flow"
import { STAGES, STAGE_MAP, type Stage } from "@/lib/constants"
import { formatCurrency, relativeHours } from "@/lib/utils"
import { Car, Clock, CheckCircle2, PackageSearch, DollarSign, Wrench, ClipboardCheck, ThumbsUp, ScanLine, ShoppingCart, Landmark, FileDown, Wallet } from "lucide-react"
import { currentQuarter } from "@/lib/vat-report"
import { Button } from "@/components/ui"
import type { JobCardData } from "@/components/job-card"
import { buildJobCoverMap } from "@/lib/job-covers"

export default async function DashboardPage() {
  // getShellUser redirects unauthenticated users to login and customers to /portal.
  const shellUser = await getShellUser()
  const ctx = (await getSessionContext())!
  const supabase = await createClient()

  const canViewAll = ctx.permissions.has("jobs.view_all")
  const canSeeMoney = ctx.permissions.has("prices.view")
  const canScan = ctx.permissions.has("purchase_orders.manage")

  const { data: jobsRaw } = await supabase
    .from("jobs")
    .select(
      "id, job_number, customer_name, customer_mobile, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, lift_bay, vehicle_reference_image_url, cover_photo_url, stage, approval_status, mileage, advisor_id, technician_id, estimated_completion, created_at, updated_at, approved_at, paid_at, paid_amount, payment_method",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })

  const jobs = jobsRaw ?? []

  // Cover = explicitly chosen cover, else the newest real exterior photo of the
  // actual car (kind = 'vehicle'); only then the AI studio render as fallback.
  const coverByJob = await buildJobCoverMap(supabase, jobs)

  const { data: parts } = await supabase
    .from("parts_requests")
    .select("status, jobs!inner(stage)")
    .is("deleted_at", null)
    .neq("jobs.stage", "delivered")
  const { data: quotes } = await supabase.from("quotations").select("total, job_id, created_at")

  // Latest invoice per job drives the payment badge on the board.
  const payByJob = new Map<string, { total: number; paid: number }>()
  if (jobs.length) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("job_id, total, amount_paid, created_at")
      .in(
        "job_id",
        jobs.map((j) => j.id),
      )
      .order("created_at", { ascending: false })
    for (const inv of invs ?? []) {
      if (inv.job_id && !payByJob.has(inv.job_id)) {
        payByJob.set(inv.job_id, { total: Number(inv.total ?? 0), paid: Number(inv.amount_paid ?? 0) })
      }
    }
  }

  function paymentStatus(j: (typeof jobs)[number]): JobCardData["payment_status"] {
    if (j.paid_at) return "paid"
    const p = payByJob.get(j.id)
    if (!p) return undefined
    if (p.total > 0 && p.paid >= p.total - 0.01) return "paid"
    if (p.paid > 0) return "partial"
    return "unpaid"
  }

  const jobCards: JobCardData[] = jobs.map((j) => ({
    ...(j as any),
    cover: coverByJob.get(j.id) ?? null,
    payment_status: paymentStatus(j),
  }))

  // ---- Metrics ----
  const active = jobs.filter((j) => j.stage !== "delivered")
  const carsInWorkshop = active.length
  const pendingApprovals = jobs.filter(
    (j) => j.stage === "customer_approval" && j.approval_status === "pending",
  ).length
  const pendingParts = (parts ?? []).filter((p) => p.status === "required" || p.status === "backordered").length
  const readyVehicles = jobs.filter((j) => j.stage === "ready_for_delivery").length
  const delivered = jobs.filter((j) => j.stage === "delivered")
  const jobsCompleted = delivered.length

  // revenue = sum of quotation totals for approved/delivered jobs
  const approvedJobIds = new Set(
    jobs.filter((j) => j.approval_status === "approved" || j.stage === "delivered").map((j) => j.id),
  )
  const latestQuoteByJob = new Map<string, number>()
  for (const q of quotes ?? []) {
    latestQuoteByJob.set(q.job_id, Number(q.total)) // ordered? not necessarily; acceptable approximation
  }
  let revenue = 0
  for (const [jobId, total] of latestQuoteByJob) {
    if (approvedJobIds.has(jobId)) revenue += total
  }

  // Total purchased (confirmed supplier invoices + purchase orders) and this quarter's net VAT.
  let totalPurchased = 0
  let purchasedThisMonth = 0
  let netVatQuarter = 0
  const quarter = currentQuarter()
  if (canSeeMoney) {
    const monthStart = `${quarter.from.slice(0, 4)}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
    const [{ data: bills }, { data: pos }, { data: qInvoices }] = await Promise.all([
      supabase
        .from("supplier_invoices")
        .select("total, vat_amount, invoice_date")
        .eq("status", "confirmed")
        .is("deleted_at", null),
      supabase.from("purchase_orders").select("total, vat_amount, order_date").neq("status", "cancelled"),
      supabase
        .from("invoices")
        .select("vat_amount")
        .neq("status", "cancelled")
        .gte("issue_date", quarter.from)
        .lte("issue_date", quarter.to),
    ])
    const purchaseRows = [
      ...(bills ?? []).map((b) => ({ total: b.total, vat: b.vat_amount, date: b.invoice_date as string | null })),
      ...(pos ?? []).map((p) => ({ total: p.total, vat: p.vat_amount, date: p.order_date as string | null })),
    ]
    let inputVatQuarter = 0
    for (const p of purchaseRows) {
      const total = Number(p.total) || 0
      totalPurchased += total
      if (p.date && p.date >= monthStart) purchasedThisMonth += total
      if (p.date && p.date >= quarter.from && p.date <= quarter.to) inputVatQuarter += Number(p.vat) || 0
    }
    const outputVatQuarter = (qInvoices ?? []).reduce((s, i) => s + (Number(i.vat_amount) || 0), 0)
    netVatQuarter = outputVatQuarter - inputVatQuarter
  }

  // avg repair time (check-in -> delivered) in hours
  const repairTimes = delivered
    .filter((j) => j.approved_at || j.updated_at)
    .map((j) => relativeHours(j.created_at, j.updated_at))
  const avgRepair = repairTimes.length ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : 0
  const avgRepairLabel = avgRepair < 24 ? `${avgRepair.toFixed(1)}h` : `${(avgRepair / 24).toFixed(1)}d`

  // stage distribution
  const stageData = STAGES.map((s) => ({
    label: s.short,
    value: jobs.filter((j) => j.stage === s.key).length,
    color: stageColor(s.key),
  }))

  // revenue by month (last 6)
  const revData = lastSixMonths().map(({ label, year, month }) => {
    let sum = 0
    for (const q of quotes ?? []) {
      const d = new Date(q.created_at)
      if (d.getFullYear() === year && d.getMonth() === month && approvedJobIds.has(q.job_id)) {
        sum += Number(q.total)
      }
    }
    return { label, revenue: Math.round(sum) }
  })

  return (
    <AppShell user={shellUser}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {canViewAll ? "Workshop Dashboard" : "My Assigned Jobs"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {canViewAll
              ? "Live overview of every vehicle in the shop."
              : `Welcome back, ${shellUser.name.split(" ")[0]}. Here are the vehicles assigned to you.`}
          </p>
        </div>
        {canScan && (
          <Link href="/purchasing/invoices">
            <Button variant="danger">
              <ScanLine className="h-4 w-4" /> Scan Purchase Invoice
            </Button>
          </Link>
        )}
      </div>

      {canSeeMoney && (
        <section
          aria-labelledby="finance-heading"
          className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="finance-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
              <Landmark className="h-4 w-4 text-primary" aria-hidden /> Finance, Purchases &amp; VAT
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/finance">
                <Button>
                  <Wallet className="h-4 w-4" /> Finance &amp; Audit Report
                </Button>
              </Link>
              <Link href="/reports/vat">
                <Button variant="ghost">
                  <Landmark className="h-4 w-4" /> VAT Dashboard
                </Button>
              </Link>
              <Link href={`/reports/vat?from=${quarter.from}&to=${quarter.to}&pdf=1`}>
                <Button>
                  <FileDown className="h-4 w-4" /> Download VAT PDF
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link href="/purchasing/invoices" className="rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <StatCard
                label="Total Purchased"
                value={formatCurrency(totalPurchased)}
                icon={ShoppingCart}
                hint="All confirmed purchase invoices"
              />
            </Link>
            <StatCard label="Purchased This Month" value={formatCurrency(purchasedThisMonth)} icon={ShoppingCart} />
            <Link href="/reports/vat" className="rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
              <StatCard
                label={netVatQuarter >= 0 ? "VAT Payable (this quarter)" : "VAT Refundable (this quarter)"}
                value={formatCurrency(Math.abs(netVatQuarter))}
                icon={Landmark}
                hint={`${quarter.from} to ${quarter.to}`}
              />
            </Link>
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={canViewAll ? "Cars in Workshop" : "My Active Jobs"} value={carsInWorkshop} icon={Car} />
        {canViewAll && (
          <StatCard
            label="Pending Approvals"
            value={pendingApprovals}
            icon={ThumbsUp}
            accent="text-amber-400"
            bg="bg-amber-500/10"
          />
        )}
        <StatCard
          label="Pending Parts"
          value={pendingParts}
          icon={PackageSearch}
          accent="text-orange-400"
          bg="bg-orange-500/10"
        />
        <StatCard
          label="Ready for Delivery"
          value={readyVehicles}
          icon={CheckCircle2}
          accent="text-emerald-400"
          bg="bg-emerald-500/10"
        />
        {canSeeMoney && (
          <StatCard
            label="Revenue (approved)"
            value={formatCurrency(revenue)}
            icon={DollarSign}
            accent="text-emerald-400"
            bg="bg-emerald-500/10"
          />
        )}
        <StatCard label="Jobs Completed" value={jobsCompleted} icon={ClipboardCheck} />
        <StatCard label="Avg Repair Time" value={avgRepairLabel} icon={Clock} accent="text-sky-400" bg="bg-sky-500/10" />
        <StatCard label={canViewAll ? "Total Job Cards" : "My Job Cards"} value={jobs.length} icon={Wrench} />
      </div>

      {/* Charts — workshop-wide insight only */}
      {canViewAll && (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Cars by Stage</h2>
            <StageBarChart data={stageData} />
          </div>
          {canSeeMoney && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Revenue (last 6 months)</h2>
              <RevenueAreaChart data={revData} />
            </div>
          )}
        </div>
      )}

      {/* Car Flow board */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{canViewAll ? "Car Flow" : "My Vehicles"}</h2>
          {canViewAll && (
            <Link href="/flow" className="text-sm text-primary hover:underline">
              Open full board →
            </Link>
          )}
        </div>
        <CarFlow jobs={jobCards.filter((j) => j.stage !== "delivered" || !j.paid_at)} />
      </div>
    </AppShell>
  )
}

function stageColor(stage: Stage) {
  const map: Record<Stage, string> = {
    check_in: "#38bdf8",
    inspection: "#22d3ee",
    quotation: "#818cf8",
    customer_approval: "#fbbf24",
    parts_required: "#fb923c",
    parts_ordered: "#facc15",
    parts_received: "#a3e635",
    repair: "#e879f9",
    quality_control: "#c084fc",
    washing: "#2dd4bf",
    ready_for_delivery: "#34d399",
    delivered: "#a1a1aa",
  }
  return map[stage]
}

function lastSixMonths() {
  const out: { label: string; year: number; month: number }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ label: d.toLocaleString("en", { month: "short" }), year: d.getFullYear(), month: d.getMonth() })
  }
  return out
}
