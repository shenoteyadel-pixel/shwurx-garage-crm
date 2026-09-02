import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/app-shell"
import { Badge, Card, UAEPlate } from "@/components/ui"
import { StageStepper } from "@/components/stage-stepper"
import { QuotationBuilder } from "@/components/quotation-builder"
import { PartsManager } from "@/components/parts-manager"
import { ApprovalSender } from "@/components/approval-sender"
import { JobPhotos } from "@/components/job-photos"
import { StaffAssign } from "@/components/staff-assign"
import { RepairDetails } from "@/components/repair-details"
import { TechnicianJobCard } from "@/components/technician-job-card"
import { BrandLogo, VehicleVisual } from "@/components/vehicle-visual"
import { RefreshVehicleImageButton } from "@/components/refresh-vehicle-image"
import { STAGE_MAP, QC_STATUSES, canViewPrices, type Stage } from "@/lib/constants"
import { formatDate } from "@/lib/utils"
import { ArrowLeft, Phone, Gauge, Hash, Fingerprint, Palette, Car, CalendarClock } from "lucide-react"

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
    .order("created_at")

  const { data: quotation } = await supabase
    .from("quotations")
    .select(
      "id, vat_rate, description, internal_notes, quotation_items(kind, name, part_number, detail, description, quantity, unit_price, labour_hours, labour_rate, labor, discount)",
    )
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: parts } = await supabase
    .from("parts_requests")
    .select("id, part_name, quantity, status, supplier, cost, notes")
    .eq("job_id", id)
    .order("created_at")

  const { data: staff } = await supabase.from("profiles").select("id, full_name, role").order("full_name")

  const stageMeta = STAGE_MAP[job.stage as Stage]
  const vehicle =
    [job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ") || "Vehicle"

  const rawItems = quotation?.quotation_items ?? []
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
    })) ?? []

  const role = profile?.role || "advisor"
  const showPrices = canViewPrices(role)

  // Cover photo for the vehicle visual = first vehicle-kind photo
  const coverPhoto = (photos ?? []).find((p: any) => p.kind === "vehicle")?.url ?? (photos ?? [])[0]?.url ?? null

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
              <h1 className="text-2xl font-bold tracking-tight">{vehicle}</h1>
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
          <JobPhotos jobId={job.id} photos={(photos ?? []) as any} />

          {showPrices ? (
            <>
              <RepairDetails job={job as any} />
              <QuotationBuilder
                jobId={job.id}
                initialItems={quoteItems}
                initialVat={Number(quotation?.vat_rate ?? 5)}
                initialDescription={quotation?.description ?? ""}
                initialInternalNotes={quotation?.internal_notes ?? ""}
                hasQuotation={!!quotation}
                printHref={`/jobs/${job.id}/quotation/print`}
                locked={locked}
              />
              <PartsManager jobId={job.id} parts={(parts ?? []) as any} />
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
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
            <div className="space-y-3 text-sm">
              <div className="font-medium">{job.customer_name}</div>
              <a
                href={`tel:${job.customer_mobile}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-4 w-4" /> {job.customer_mobile}
              </a>
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
