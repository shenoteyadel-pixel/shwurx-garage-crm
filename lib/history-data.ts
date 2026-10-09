import "server-only"
import { createClient } from "@/lib/supabase/server"

export type HistoryStatus = "paid" | "partial" | "unpaid" | "cancelled"

export type HistoryRow = {
  id: string
  invoiceNumber: string
  date: string | null
  status: HistoryStatus
  total: number
  paid: number
  balance: number
  customerId: string | null
  customerName: string
  customerMobile: string | null
  vehicleId: string | null
  make: string | null
  model: string | null
  year: number | null
  vehicleLabel: string
  plateEmirate: string | null
  plateCode: string | null
  plateNumber: string | null
  plateText: string
  vin: string | null
  jobId: string | null
  jobNumber: string | null
  jobArchived: boolean
}

export type CustomerSummary = {
  key: string
  customerId: string | null
  name: string
  mobile: string | null
  vehicles: number
  visits: number
  invoiced: number
  paid: number
  outstanding: number
  lastVisit: string | null
}

export type VehicleSummary = {
  key: string
  vehicleId: string | null
  label: string
  make: string | null
  plateEmirate: string | null
  plateCode: string | null
  plateNumber: string | null
  plateText: string
  vin: string | null
  ownerId: string | null
  ownerName: string
  visits: number
  invoiced: number
  lastService: string | null
}

const STATUSES: HistoryStatus[] = ["paid", "partial", "unpaid", "cancelled"]

function normalizeStatus(s: string | null, total: number, paid: number): HistoryStatus {
  if (s && (STATUSES as string[]).includes(s)) return s as HistoryStatus
  if (paid >= total - 0.01 && total > 0) return "paid"
  return paid > 0 ? "partial" : "unpaid"
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "")

/**
 * Every customer invoice ever issued — including cancelled ones and invoices
 * whose job card was archived — so history is never lost.
 */
export async function loadHistory(): Promise<HistoryRow[]> {
  const supabase = await createClient()
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, issue_date, created_at, status, total, amount_paid, customer_name, customer_mobile, vehicle_desc, plate, job_id, job:jobs!invoices_job_id_fkey(id, job_number, customer_id, vehicle_id, vehicle_make, vehicle_model, vehicle_year, plate_emirate, plate_code, plate_number, deleted_at)",
    )
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5000)

  const rows = (invoices ?? []) as any[]
  const vehicleIds = [...new Set(rows.map((r) => r.job?.vehicle_id).filter(Boolean))] as string[]
  const customerIds = [...new Set(rows.map((r) => r.job?.customer_id).filter(Boolean))] as string[]

  const [{ data: vehicles }, { data: customers }] = await Promise.all([
    vehicleIds.length
      ? supabase
          .from("vehicles")
          .select("id, make, model, year, vin, plate_emirate, plate_code, plate_number")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [] as any[] }),
    customerIds.length
      ? supabase.from("customers").select("id, full_name, mobile").in("id", customerIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const vehicleById = new Map((vehicles ?? []).map((v: any) => [v.id, v]))
  const customerById = new Map((customers ?? []).map((c: any) => [c.id, c]))

  return rows.map((r) => {
    const job = r.job ?? null
    const v = job?.vehicle_id ? vehicleById.get(job.vehicle_id) : null
    const c = job?.customer_id ? customerById.get(job.customer_id) : null
    const total = Number(r.total) || 0
    const paid = Number(r.amount_paid) || 0
    const status = normalizeStatus(r.status, total, paid)
    const make = v?.make ?? job?.vehicle_make ?? null
    const model = v?.model ?? job?.vehicle_model ?? null
    const year = v?.year ?? job?.vehicle_year ?? null
    const plateEmirate = v?.plate_emirate ?? job?.plate_emirate ?? null
    const plateCode = v?.plate_code ?? job?.plate_code ?? null
    const plateNumber = v?.plate_number ?? job?.plate_number ?? null
    const plateText =
      [plateEmirate, plateCode, plateNumber].filter(Boolean).join(" ") || (r.plate as string | null) || ""
    return {
      id: r.id,
      invoiceNumber: r.invoice_number,
      date: r.issue_date ?? r.created_at ?? null,
      status,
      total,
      paid,
      balance: status === "cancelled" ? 0 : Math.max(0, total - paid),
      customerId: job?.customer_id ?? null,
      customerName: c?.full_name || r.customer_name || "Walk-in customer",
      customerMobile: c?.mobile || r.customer_mobile || null,
      vehicleId: job?.vehicle_id ?? null,
      make,
      model,
      year,
      vehicleLabel: [year, make, model].filter(Boolean).join(" ") || r.vehicle_desc || "Vehicle",
      plateEmirate,
      plateCode,
      plateNumber,
      plateText,
      vin: v?.vin ?? null,
      jobId: job?.id ?? r.job_id ?? null,
      jobNumber: job?.job_number ?? null,
      jobArchived: !!job?.deleted_at,
    }
  })
}

/** Every word must match somewhere: invoice, job, name, phone, plate, VIN or car. */
export function searchHistory(rows: HistoryRow[], query: string): HistoryRow[] {
  const tokens = query.trim().split(/\s+/).map(compact).filter(Boolean)
  if (!tokens.length) return rows
  return rows.filter((r) => {
    const hay = compact(
      [
        r.invoiceNumber,
        r.jobNumber,
        r.customerName,
        r.customerMobile,
        r.vehicleLabel,
        r.plateText,
        r.plateCode && r.plateNumber ? `${r.plateCode}${r.plateNumber}` : null,
        r.vin,
        r.status,
      ]
        .filter(Boolean)
        .join("|"),
    )
    const phone = (r.customerMobile ?? "").replace(/\D/g, "")
    return tokens.every((t) => hay.includes(t) || (/^\d{4,}$/.test(t) && phone.includes(t.replace(/^0+/, ""))))
  })
}

export function isStatus(s: string | undefined): s is HistoryStatus {
  return !!s && (STATUSES as string[]).includes(s)
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

export function summarizeCustomers(rows: HistoryRow[]): CustomerSummary[] {
  const map = new Map<string, CustomerSummary & { vehicleKeys: Set<string> }>()
  for (const r of rows) {
    const key = r.customerId ?? `name:${compact(r.customerName)}:${(r.customerMobile ?? "").replace(/\D/g, "")}`
    const s =
      map.get(key) ??
      ({
        key,
        customerId: r.customerId,
        name: r.customerName,
        mobile: r.customerMobile,
        vehicles: 0,
        visits: 0,
        invoiced: 0,
        paid: 0,
        outstanding: 0,
        lastVisit: null,
        vehicleKeys: new Set<string>(),
      } as CustomerSummary & { vehicleKeys: Set<string> })
    s.visits += 1
    if (r.status !== "cancelled") {
      s.invoiced += r.total
      s.paid += r.paid
      s.outstanding += r.balance
    }
    s.vehicleKeys.add(r.vehicleId ?? compact(r.plateText || r.vehicleLabel))
    s.lastVisit = later(s.lastVisit, r.date)
    map.set(key, s)
  }
  return [...map.values()]
    .map(({ vehicleKeys, ...s }) => ({ ...s, vehicles: vehicleKeys.size }))
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""))
}

export function summarizeVehicles(rows: HistoryRow[]): VehicleSummary[] {
  const map = new Map<string, VehicleSummary>()
  for (const r of rows) {
    const key = r.vehicleId ?? `plate:${compact(r.plateText || r.vehicleLabel)}`
    const s =
      map.get(key) ??
      ({
        key,
        vehicleId: r.vehicleId,
        label: r.vehicleLabel,
        make: r.make,
        plateEmirate: r.plateEmirate,
        plateCode: r.plateCode,
        plateNumber: r.plateNumber,
        plateText: r.plateText,
        vin: r.vin,
        ownerId: r.customerId,
        ownerName: r.customerName,
        visits: 0,
        invoiced: 0,
        lastService: null,
      } as VehicleSummary)
    s.visits += 1
    if (r.status !== "cancelled") s.invoiced += r.total
    if (!s.lastService || (r.date && r.date > s.lastService)) {
      s.ownerId = r.customerId
      s.ownerName = r.customerName
    }
    s.lastService = later(s.lastService, r.date)
    map.set(key, s)
  }
  return [...map.values()].sort((a, b) => (b.lastService ?? "").localeCompare(a.lastService ?? ""))
}
