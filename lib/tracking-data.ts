import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { STAGE_ORDER, STAGE_MAP, type Stage } from "@/lib/constants"

/* ------------------------------------------------------------------ *
 * Customer-safe tracking detail.
 *
 * Everything here is intended to be shown to the CUSTOMER on the public
 * /track link. It deliberately excludes internal-only data: staff notes,
 * part costs/suppliers, technician assignments beyond a friendly first
 * name, profit, internal quotation notes, etc.
 * ------------------------------------------------------------------ */

/** Customer-facing milestones — a friendly grouping of the internal pipeline. */
export interface TrackMilestone {
  key: string
  label: string
  description: string
  state: "done" | "current" | "upcoming"
}

const MILESTONE_DEFS: { key: string; label: string; description: string; stages: Stage[] }[] = [
  { key: "checkin", label: "Checked In", description: "We've received your vehicle and logged it into our workshop.", stages: ["check_in"] },
  { key: "inspection", label: "Inspection", description: "Our technicians are inspecting your vehicle to confirm what's needed.", stages: ["inspection"] },
  { key: "quote", label: "Quotation & Approval", description: "We've prepared your quotation. Your approval lets us begin the work.", stages: ["quotation", "customer_approval"] },
  { key: "parts", label: "Parts", description: "Sourcing and receiving the parts required for your repair.", stages: ["parts_required", "parts_ordered", "parts_received"] },
  { key: "repair", label: "Repair in Progress", description: "Our technicians are carrying out the approved work on your vehicle.", stages: ["repair"] },
  { key: "qc", label: "Quality Control", description: "We're double-checking every detail to meet our workshop standards.", stages: ["quality_control"] },
  { key: "wash", label: "Washing & Detailing", description: "A complimentary clean and detail before you collect your vehicle.", stages: ["washing"] },
  { key: "ready", label: "Ready for Collection", description: "Your vehicle is ready — come collect it at your convenience.", stages: ["ready_for_delivery"] },
  { key: "delivered", label: "Delivered", description: "Your vehicle has been handed back. Thank you for choosing us.", stages: ["delivered"] },
]

export interface TrackQuoteItem {
  description: string
  kind: string
  quantity: number
  lineTotal: number | null
}

export interface TrackPart {
  name: string
  quantity: number
  status: string
  statusLabel: string
}

export interface TrackPhoto {
  id: string
  url: string
  kind: string | null
  caption: string | null
}

export interface TrackInspectionMarker {
  id: string
  view: string
  xPct: number
  yPct: number
  damageType: string
  severity: string | null
  locationLabel: string | null
  note: string | null
  photos: { id: string; url: string }[]
}

export interface TrackInspection {
  odometer: number | null
  fuelLevel: string | null
  completed: boolean
  markers: TrackInspectionMarker[]
}

export interface TrackInvoice {
  invoiceNumber: string | null
  status: string | null
  total: number
  amountPaid: number
  outstanding: number
  payLinkUrl: string | null
  payLinkLabel: string | null
}

export interface TrackQuote {
  total: number
  vatInclusive: boolean
  awaitingApproval: boolean
  approved: boolean
  approvalPath: string | null
  items: TrackQuoteItem[]
}

export interface TrackingDetail {
  customerName: string
  customerFirstName: string
  vehicleLabel: string
  make: string | null
  model: string | null
  bodyType: string | null
  color: string | null
  plate: string | null
  mileage: number | null
  referenceImage: string | null
  jobNumber: string | null
  stage: Stage
  stageLabel: string
  stageAccentText: string
  progressPct: number
  complaint: string | null
  technicianFirstName: string | null
  estimatedCompletion: string | null
  updatedAt: string | null
  milestones: TrackMilestone[]
  quote: TrackQuote | null
  parts: TrackPart[]
  beforePhotos: TrackPhoto[]
  afterPhotos: TrackPhoto[]
  inspection: TrackInspection | null
  invoice: TrackInvoice | null
  otherActiveJobs: number
}

const PART_STATUS_LABELS: Record<string, string> = {
  required: "Required",
  ordered: "Ordered",
  received: "Received",
  backordered: "On backorder",
}

function firstName(full: string | null | undefined): string {
  if (!full) return ""
  return full.trim().split(/\s+/)[0] ?? ""
}

function buildMilestones(stage: Stage): TrackMilestone[] {
  const currentIdx = STAGE_ORDER.indexOf(stage)
  return MILESTONE_DEFS.map((m) => {
    const idxs = m.stages.map((s) => STAGE_ORDER.indexOf(s))
    const minIdx = Math.min(...idxs)
    const maxIdx = Math.max(...idxs)
    let state: TrackMilestone["state"]
    if (currentIdx > maxIdx) state = "done"
    else if (currentIdx >= minIdx) state = "current"
    else state = "upcoming"
    return { key: m.key, label: m.label, description: m.description, state }
  })
}

/**
 * Load the full customer-safe tracking detail for a customer's primary job.
 * The "primary" job is the most recent job that is not yet delivered; if every
 * job is delivered, it's the most recent job overall. Every sub-query is
 * defensive so a missing optional table never breaks the page.
 */
export async function loadTrackingDetail(customerId: string): Promise<TrackingDetail | null> {
  const svc = createServiceClient()

  const { data: customer } = await svc
    .from("customers")
    .select("id, full_name, mobile")
    .eq("id", customerId)
    .maybeSingle()
  if (!customer) return null

  const { data: jobs } = await svc
    .from("jobs")
    .select(
      "id, job_number, stage, created_at, updated_at, vehicle_make, vehicle_model, vehicle_year, variant, color, body_type, plate_number, plate_emirate, plate_code, mileage, complaint, technician_id, estimated_completion, approval_status, approved_at, vehicle_reference_image_url, cover_photo_url",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })

  if (!jobs || jobs.length === 0) return null

  const openJobs = jobs.filter((j) => j.stage !== "delivered")
  const primary = openJobs[0] ?? jobs[0]
  const stage = (STAGE_ORDER.includes(primary.stage as Stage) ? primary.stage : "check_in") as Stage
  const meta = STAGE_MAP[stage]

  // Technician first name (friendly, never full staff record).
  let technicianFirstName: string | null = null
  if (primary.technician_id) {
    const { data: tech } = await svc
      .from("profiles")
      .select("full_name")
      .eq("id", primary.technician_id)
      .maybeSingle()
    technicianFirstName = firstName(tech?.full_name) || null
  }

  // Latest quotation + items (customer-safe fields only).
  let quote: TrackQuote | null = null
  const { data: quotation } = await svc
    .from("quotations")
    .select("id, total, vat_inclusive, created_at")
    .eq("job_id", primary.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (quotation) {
    const { data: items } = await svc
      .from("quotation_items")
      .select("description, name, kind, quantity, line_total, sort_order")
      .eq("quotation_id", quotation.id)
      .order("sort_order", { ascending: true })

    // Latest approval request (for the Review & Approve link + decision state).
    const { data: approval } = await svc
      .from("approval_requests")
      .select("token, status, decided_at")
      .eq("job_id", primary.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const approved =
      primary.approval_status === "approved" ||
      approval?.status === "approved" ||
      approval?.status === "signed" ||
      !!primary.approved_at
    const awaitingApproval = !approved && (stage === "customer_approval" || primary.approval_status === "pending")

    quote = {
      total: Number(quotation.total) || 0,
      vatInclusive: !!quotation.vat_inclusive,
      awaitingApproval,
      approved,
      approvalPath: approval?.token && !approved ? `/approve/r/${approval.token}` : null,
      items: (items ?? []).map((it) => ({
        description: (it.description || it.name || "Service item") as string,
        kind: (it.kind as string) || "part",
        quantity: Number(it.quantity) || 1,
        lineTotal: it.line_total != null ? Number(it.line_total) : null,
      })),
    }
  }

  // Parts (customer-safe: name, qty, status only — never cost/supplier/notes).
  const { data: partsRows } = await svc
    .from("parts_requests")
    .select("part_name, quantity, status")
    .eq("job_id", primary.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  const parts: TrackPart[] = (partsRows ?? []).map((p) => {
    const status = (p.status as string) || "required"
    return {
      name: (p.part_name as string) || "Part",
      quantity: Number(p.quantity) || 1,
      status,
      statusLabel: PART_STATUS_LABELS[status] ?? status,
    }
  })

  // Photos, split into before/after.
  const { data: photoRows } = await svc
    .from("vehicle_photos")
    .select("id, url, kind, caption, created_at")
    .eq("job_id", primary.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  const beforePhotos: TrackPhoto[] = []
  const afterPhotos: TrackPhoto[] = []
  // Only vehicle-facing photos are shown to the customer. Parts and document
  // photos stay internal and never appear on the tracking page.
  const CUSTOMER_KINDS = new Set(["vehicle", "cover", "damage"])
  for (const p of photoRows ?? []) {
    const k = (p.kind as string)?.toLowerCase() ?? ""
    const isAfter = k.includes("after")
    if (!isAfter && !CUSTOMER_KINDS.has(k)) continue
    const photo: TrackPhoto = {
      id: p.id as string,
      url: p.url as string,
      kind: (p.kind as string) ?? null,
      caption: (p.caption as string) ?? null,
    }
    if (isAfter) afterPhotos.push(photo)
    else beforePhotos.push(photo)
  }

  // Vehicle condition inspection (customer-safe: diagram, markers, marker photos —
  // never internal odometer edits or staff notes beyond the documented condition).
  //
  // The inspection section ALWAYS renders on the customer tracking page — for
  // every vehicle, including existing jobs and jobs with zero recorded damage
  // (which show a clean "no damage recorded" state). We never gate it on the
  // marker count. When no inspection record exists yet we synthesize an empty
  // one for display only (no DB write here).
  let markers: TrackInspectionMarker[] = []
  const { data: inspectionRow } = await svc
    .from("vehicle_inspections")
    .select("id, odometer, fuel_level, status")
    .eq("job_id", primary.id)
    .eq("inspection_type", "check_in")
    .maybeSingle()
  if (inspectionRow) {
    const { data: markerRows } = await svc
      .from("inspection_markers")
      .select(
        "id, view, x_pct, y_pct, damage_type, severity, location_label, note, position, inspection_marker_photos(id, url)",
      )
      .eq("inspection_id", inspectionRow.id)
      .is("deleted_at", null)
      .order("position", { ascending: true })
    markers = (markerRows ?? []).map((m: any) => ({
      id: m.id as string,
      view: m.view as string,
      xPct: Number(m.x_pct),
      yPct: Number(m.y_pct),
      damageType: m.damage_type as string,
      severity: (m.severity as string) ?? null,
      locationLabel: (m.location_label as string) ?? null,
      note: (m.note as string) ?? null,
      photos: (m.inspection_marker_photos ?? []).map((p: any) => ({ id: p.id as string, url: p.url as string })),
    }))
  }
  const inspection: TrackInspection = {
    odometer: inspectionRow?.odometer != null ? Number(inspectionRow.odometer) : null,
    fuelLevel: (inspectionRow?.fuel_level as string) ?? null,
    completed: (inspectionRow?.status as string) === "completed",
    markers,
  }

  // Invoice for the primary job.
  let invoice: TrackInvoice | null = null
  const { data: inv } = await svc
    .from("invoices")
    .select("invoice_number, status, total, amount_paid, payment_link_url, payment_link_label, payment_link_enabled")
    .eq("job_id", primary.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (inv) {
    const total = Number(inv.total) || 0
    const amountPaid = Number(inv.amount_paid) || 0
    const outstanding = Math.max(0, total - amountPaid)
    // Only expose the PAY NOW link when staff enabled it AND there is a balance due.
    const linkLive = !!inv.payment_link_enabled && !!inv.payment_link_url && outstanding > 0.01
    invoice = {
      invoiceNumber: (inv.invoice_number as string) ?? null,
      status: (inv.status as string) ?? null,
      total,
      amountPaid,
      outstanding,
      payLinkUrl: linkLive ? (inv.payment_link_url as string) : null,
      payLinkLabel: linkLive ? ((inv.payment_link_label as string) ?? null) : null,
    }
  }

  const vehicleLabel =
    [primary.vehicle_year, primary.vehicle_make, primary.vehicle_model].filter(Boolean).join(" ") || "Your vehicle"
  const plate = [primary.plate_emirate, primary.plate_code, primary.plate_number].filter(Boolean).join(" ") || null

  return {
    customerName: customer.full_name,
    customerFirstName: firstName(customer.full_name) || customer.full_name,
    vehicleLabel,
    make: primary.vehicle_make ?? null,
    model: primary.vehicle_model ?? null,
    bodyType: primary.body_type ?? null,
    color: primary.color ?? null,
    plate,
    mileage: primary.mileage != null ? Number(primary.mileage) : null,
    // Prefer the explicitly chosen cover photo; otherwise the CarsXE reference image.
    referenceImage: primary.cover_photo_url ?? primary.vehicle_reference_image_url ?? null,
    jobNumber: primary.job_number ?? null,
    stage,
    stageLabel: meta?.label ?? stage,
    stageAccentText: meta?.text ?? "text-primary",
    progressPct: Math.round(((STAGE_ORDER.indexOf(stage) + 1) / STAGE_ORDER.length) * 100),
    complaint: primary.complaint ?? null,
    technicianFirstName,
    estimatedCompletion: primary.estimated_completion ?? null,
    updatedAt: primary.updated_at ?? null,
    milestones: buildMilestones(stage),
    quote,
    parts,
    beforePhotos,
    afterPhotos,
    inspection,
    invoice,
    otherActiveJobs: Math.max(0, openJobs.length - 1),
  }
}
