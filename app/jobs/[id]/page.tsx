import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { Badge, Card, UAEPlate } from "@/components/ui"
import { StageStepper } from "@/components/stage-stepper"
import { QuotationBuilder } from "@/components/quotation-builder"
import { PartsManager } from "@/components/parts-manager"
import { ApprovalSender } from "@/components/approval-sender"
import { ApprovalsPanel } from "@/components/approvals-panel"
import { getJobApprovals } from "@/lib/actions-approvals"
import { JobPhotos } from "@/components/job-photos"
import { StaffAssign } from "@/components/staff-assign"
import { JobCustomerAccess } from "@/components/job-customer-access"
import { RepairDetails } from "@/components/repair-details"
import { DiagnosticsPanel, type DiagnosticTest } from "@/components/diagnostics-panel"
import { InspectionPanel } from "@/components/inspection/inspection-panel"
import { TechnicianJobCard } from "@/components/technician-job-card"
import { BrandLogo, VehicleVisual } from "@/components/vehicle-visual"
import { RefreshVehicleImageButton } from "@/components/refresh-vehicle-image"
import { STAGE_MAP, QC_STATUSES, canViewPrices, type Stage } from "@/lib/constants"
import { formatDate } from "@/lib/utils"
import {
  ArrowLeft,
  Phone,
  Gauge,
  Hash,
  Fingerprint,
  Palette,
  Car,
  CalendarClock,
  FileText,
  ReceiptText,
  ShoppingCart,
  FolderOpen,
} from "lucide-react"

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle()

  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle()
  if (!job) notFound()

  const { data: photos } = await supabase
    .from("vehicle_photos")
    .select("id, url, kind, caption")
    .eq("job_id", id)
    .is("deleted_at", null)
    .order("created_at")

  const { data: quotation } = await supabase
    .from("quotations")
    .select(
      "id, vat_rate, vat_inclusive, description, internal_notes, quotation_items(kind, name, part_number, detail, description, quantity, unit_price, labour_hours, labour_rate, labor, discount, category, recommendation, sort_order)",
    )
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const approvals = await getJobApprovals(id)

  const { data: parts } = await supabase
    .from("parts_requests")
    .select("id, part_name, quantity, status, supplier, cost, notes")
    .eq("job_id", id)
    .is("deleted_at", null)
    .order("created_at")

  // AI Diagnostic Assistant: session + technician-verified test workflow.
  const { data: diagnosticSession } = await supabase
    .from("diagnostic_sessions")
    .select(
      "id, symptoms, observations, error_codes, ai_output, ai_model, ai_generated_at, confirmed_diagnosis, confirmed_at",
    )
    .eq("job_id", id)
    .maybeSingle()
  let diagnosticTests: DiagnosticTest[] = []
  if (diagnosticSession) {
    const { data: dTests } = await supabase
      .from("diagnostic_tests")
      .select("id, description, source, status, result_note, performed_at")
      .eq("session_id", diagnosticSession.id)
      .is("deleted_at", null)
      .order("position", { ascending: true })
    diagnosticTests = (dTests ?? []) as DiagnosticTest[]
  }
  const diagnosticVehicleSummary =
    [job.vehicle_year, job.vehicle_make, job.vehicle_model, job.variant].filter(Boolean).join(" ") +
    (job.mileage ? ` · ${Number(job.mileage).toLocaleString()} km` : "")

  // Vehicle inspection (check-in): header + damage markers + per-marker photos.
  const { data: inspectionRow } = await supabase
    .from("vehicle_inspections")
    .select("id, status, odometer, fuel_level, general_notes, signature_data_url, signed_by_name")
    .eq("job_id", id)
    .eq("inspection_type", "check_in")
    .maybeSingle()
  let inspectionMarkers: any[] = []
  if (inspectionRow) {
    const { data: mk } = await supabase
      .from("inspection_markers")
      .select(
        "id, view, x_pct, y_pct, damage_type, severity, location_label, note, position, inspection_marker_photos(id, url)",
      )
      .eq("inspection_id", inspectionRow.id)
      .is("deleted_at", null)
      .order("position", { ascending: true })
    inspectionMarkers = mk ?? []
  }
  const inspectionData = {
    id: inspectionRow?.id ?? null,
    status: (inspectionRow?.status ?? "in_progress") as "in_progress" | "completed",
    odometer: inspectionRow?.odometer ?? null,
    fuel_level: inspectionRow?.fuel_level ?? null,
    general_notes: inspectionRow?.general_notes ?? null,
    signature_data_url: inspectionRow?.signature_data_url ?? null,
    signed_by_name: inspectionRow?.signed_by_name ?? null,
    markers: inspectionMarkers.map((m) => ({
      id: m.id,
      view: m.view,
      x_pct: Number(m.x_pct),
      y_pct: Number(m.y_pct),
      damage_type: m.damage_type,
      severity: m.severity,
      location_label: m.location_label,
      note: m.note,
      photos: (m.inspection_marker_photos ?? []).map((p: any) => ({ id: p.id, url: p.url })),
    })),
  }

  const { data: staffRows } = await supabase
    .from("profiles")
    .select("id, full_name, role, job_title, skills, is_active")
    .neq("role", "customer")
    .eq("is_active", true)
    .order("full_name")

  // Active workload per staff member (any job not yet delivered) so the
  // assignment dropdowns can show who is busy.
  const { data: activeJobs } = await supabase
    .from("jobs")
    .select("technician_id, advisor_id")
    .neq("stage", "delivered")
  const activeCount = new Map<string, number>()
  for (const j of activeJobs ?? []) {
    if (j.technician_id) activeCount.set(j.technician_id, (activeCount.get(j.technician_id) ?? 0) + 1)
  }
  const staff = (staffRows ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    role: s.role,
    job_title: s.job_title ?? null,
    skills: (s.skills ?? []) as string[],
    active_jobs: activeCount.get(s.id) ?? 0,
  }))

  const stageMeta = STAGE_MAP[job.stage as Stage]
  const vehicle =
    [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"

  const rawItems = [...(quotation?.quotation_items ?? [])].sort(
    (a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )
  const quoteItems =
    rawItems.map((i: any) => ({
      kind: (i.kind === "labor" || i.kind === "service" ? "labor" : "part") as "part" | "labor",
      name: i.name || i.description || "",
      part_number: i.part_number || "",
      detail: i.detail || "",
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      labour_hours: Number(i.labour_hours ?? 0),
      labour_rate: Number(i.labour_rate ?? 0),
      discount: Number(i.discount ?? 0),
      category: i.category || "",
      recommendation: (i.recommendation || "required") as "required" | "recommended" | "optional",
    })) ?? []

  const role = profile?.role || "advisor"
  const showPrices = canViewPrices(role)

  // Cover photo = the explicitly chosen cover only. Never auto-derived from
  // uploaded photos, so a parts/document shot can never become the vehicle image.
  const coverPhoto = job.cover_photo_url ?? null

  // Prices-free lists for the technician job card
  const techLabour = quoteItems
    .filter((i) => i.kind === "labor")
    .map((i) => ({ name: i.name, detail: i.detail }))
  const techParts = [
    ...quoteItems.filter((i) => i.kind === "part").map((i) => ({
      name: i.name,
      part_number: i.part_number,
      quantity: i.quantity,
    })),
    ...(parts ?? []).map((p: any) => ({ name: p.part_name, part_number: null, quantity: p.quantity })),
  ]

  const qcMeta = QC_STATUSES.find((q) => q.value === (job.qc_status || "pending"))

  const locked = job.approval_status === "approved"

  return (
    <AppShell user={{ name: profile?.full_name || user!.email || "Staff", role: profile?.role || "advisor" }}>
      <Link
        href="/jobs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All job cards
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
            <VehicleVisual
              coverPhoto={coverPhoto}
              referenceImage={job.vehicle_reference_image_url}
              referenceImageSource={job.vehicle_image_source}
              make={job.vehicle_make}
              model={job.vehicle_model}
              bodyType={job.body_type}
              color={job.color}
              className="h-20 w-32 rounded-lg border border-border"
            />
            {!coverPhoto && <RefreshVehicleImageButton jobId={job.id} source={job.vehicle_image_source} />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <BrandLogo make={job.vehicle_make} size={36} />
              {job.vehicle_id ? (
                <Link href={`/vehicles/${job.vehicle_id}`}>
                  <h1 className="text-2xl font-bold tracking-tight hover:underline">{vehicle}</h1>
                </Link>
              ) : (
                <h1 className="text-2xl font-bold tracking-tight">{vehicle}</h1>
              )}
              <Badge className={stageMeta.chip}>
                <span className={`h-1.5 w-1.5 rounded-full ${stageMeta.dot}`} />
                {stageMeta.label}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {job.job_number} · opened {formatDate(job.created_at)}
            </p>
            {(job.variant || job.color) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[job.variant, job.color].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        {(job.plate_emirate || job.plate_code || job.plate_number) &&
          (job.plate_emirate || job.plate_code ? (
            <UAEPlate
              emirate={job.plate_emirate}
              code={job.plate_code}
              number={job.plate_number}
              className="h-11 text-base"
            />
          ) : (
            <span className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
              {job.plate_number}
            </span>
          ))}
      </div>

      <Card className="mb-6 p-4">
        <StageStepper jobId={job.id} stage={job.stage as Stage} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
              <JobPhotos jobId={job.id} photos={(photos ?? []) as any} coverUrl={coverPhoto} />

          {showPrices ? (
            <>
              <RepairDetails job={job as any} />
              <InspectionPanel
                jobId={job.id}
                inspection={inspectionData}
                printHref={`/jobs/${job.id}/inspection/print`}
                bodyType={job.body_type}
                make={job.vehicle_make}
                model={job.vehicle_model}
              />
              <DiagnosticsPanel
                jobId={job.id}
                session={(diagnosticSession as any) ?? null}
                tests={diagnosticTests}
                vehicleSummary={diagnosticVehicleSummary}
                complaint={job.complaint}
              />
              <QuotationBuilder
                jobId={job.id}
                initialItems={quoteItems}
                initialVat={Number(quotation?.vat_rate ?? 5)}
                initialVatInclusive={Boolean(quotation?.vat_inclusive)}
                initialDescription={quotation?.description ?? ""}
                initialInternalNotes={quotation?.internal_notes ?? ""}
                hasQuotation={!!quotation}
                printHref={`/jobs/${job.id}/quotation/print`}
                locked={locked}
              />
              <PartsManager jobId={job.id} parts={(parts ?? []) as any} locked={locked} />
            </>
          ) : (
            <>
              <TechnicianJobCard
                complaint={job.complaint}
                approved={locked}
                labour={techLabour}
                parts={techParts}
              />
              <RepairDetails job={job as any} />
              <InspectionPanel
                jobId={job.id}
                inspection={inspectionData}
                printHref={`/jobs/${job.id}/inspection/print`}
                bodyType={job.body_type}
                make={job.vehicle_make}
                model={job.vehicle_model}
              />
              <DiagnosticsPanel
                jobId={job.id}
                session={(diagnosticSession as any) ?? null}
                tests={diagnosticTests}
                vehicleSummary={diagnosticVehicleSummary}
                complaint={job.complaint}
              />
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
            <div className="space-y-3 text-sm">
              {job.customer_id ? (
                <Link href={`/customers/${job.customer_id}`} className="font-medium hover:underline">
                  {job.customer_name}
                </Link>
              ) : (
                <div className="font-medium">{job.customer_name}</div>
              )}
              <a
                href={`tel:${job.customer_mobile}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-4 w-4" /> {job.customer_mobile}
              </a>
              {job.vehicle_id ? (
                <Link
                  href={`/vehicles/${job.vehicle_id}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Car className="h-4 w-4" /> Vehicle service history
                </Link>
              ) : null}
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <Detail icon={Car} label="Variant" value={job.variant || "—"} />
              <Detail icon={Palette} label="Color" value={job.color || "—"} />
              <Detail icon={Gauge} label="Year" value={job.vehicle_year ? String(job.vehicle_year) : "—"} />
              <Detail icon={Hash} label="Mileage" value={job.mileage ? `${job.mileage.toLocaleString()} km` : "—"} />
              <Detail icon={Fingerprint} label="VIN" value={job.vin || "—"} mono />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">QC</span>
              <Badge className={qcMeta?.chip}>{qcMeta?.label}</Badge>
              {job.estimated_completion && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" /> ETA {formatDate(job.estimated_completion)}
                </span>
              )}
            </div>
            {job.complaint && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Customer complaint
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.complaint}</p>
              </div>
            )}
            {job.notes && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</div>
                <p className="text-sm text-muted-foreground">{job.notes}</p>
              </div>
            )}
          </Card>

          <StaffAssign
            jobId={job.id}
            staff={(staff ?? []) as any}
            advisorId={job.advisor_id}
            technicianId={job.technician_id}
          />

          {job.customer_id && <JobCustomerAccess jobId={job.id} />}

          {showPrices && (
            <ApprovalsPanel
              jobId={job.id}
              approvals={approvals}
              hasQuotation={!!quotation}
              vatRate={Number(quotation?.vat_rate ?? 5)}
              vatInclusive={Boolean(quotation?.vat_inclusive)}
            />
          )}

          {showPrices && (
            <ApprovalSender
              jobId={job.id}
              token={job.approval_token}
              hasQuotation={!!quotation}
              approvalStatus={job.approval_status}
              customerName={job.customer_name}
              vehicle={vehicle}
            />
          )}

          {showPrices && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </h2>
              <div className="flex flex-col gap-2">
                <Link
                  href={`/jobs/${job.id}/documents`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" /> Document Center
                </Link>
                <Link
                  href={`/jobs/${job.id}/quotation/print`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" /> Quotation PDF
                </Link>
                <Link
                  href={`/invoices/new?job=${job.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <ReceiptText className="h-4 w-4" /> Create Invoice
                </Link>
                <Link
                  href={`/purchasing/new?job=${job.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Raise Purchase Order
                </Link>
              </div>
            </Card>
          )}

          {job.approval_comment && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Customer response
              </h2>
              <p className="text-sm text-muted-foreground">{job.approval_comment}</p>
              {job.approval_signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.approval_signature || "/placeholder.svg"}
                  alt="Customer signature"
                  className="mt-3 h-20 rounded-lg border border-border bg-white"
                />
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: any
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  )
}
