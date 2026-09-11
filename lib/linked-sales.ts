import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

export type LinkedSalesInvoice = {
  id: string
  invoice_number: string | null
  job_id: string | null
  total: number
  amount_paid: number
  status: string | null
  issue_date: string | null
  paid: boolean
}

export type LinkedVehicle = {
  vin: string
  label: string
  jobCount: number
  invoices: LinkedSalesInvoice[]
}

const normVin = (v: string | null | undefined) => (v ?? "").trim().toUpperCase()

/**
 * Given a supplier (purchase) invoice, find the customer sales invoice(s) for
 * the SAME car(s). The link is the VIN/chassis number: purchase-invoice line
 * items are tagged with a job_id during review, each job carries a VIN, and we
 * then gather every job — across all visits — that shares that VIN, plus the
 * customer sales invoices raised against those jobs.
 */
export async function getLinkedSalesForSupplierInvoice(
  supabase: Supabase,
  supplierInvoiceId: string,
): Promise<LinkedVehicle[]> {
  const { data: items } = await supabase
    .from("supplier_invoice_items")
    .select("job_id")
    .eq("invoice_id", supplierInvoiceId)
    .not("job_id", "is", null)

  const seedJobIds = Array.from(new Set((items ?? []).map((i) => i.job_id as string).filter(Boolean)))
  if (seedJobIds.length === 0) return []

  const { data: seedJobs } = await supabase.from("jobs").select("id, vin").in("id", seedJobIds)

  const rawVins = Array.from(
    new Set((seedJobs ?? []).map((j) => (j.vin as string | null)).filter((v): v is string => !!v && v.trim().length > 0)),
  )
  if (rawVins.length === 0) return []

  // Every job for the same car(s), across all visits, matched by VIN.
  const { data: allJobs } = await supabase
    .from("jobs")
    .select("id, job_number, vin, vehicle_make, vehicle_model, vehicle_year, plate_number, customer_name")
    .in("vin", rawVins)

  const jobs = allJobs ?? []
  const jobIds = jobs.map((j) => j.id as string)
  if (jobIds.length === 0) return []

  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("id, invoice_number, job_id, total, amount_paid, status, issue_date")
    .in("job_id", jobIds)
    .order("issue_date", { ascending: false })

  // Group jobs (and their invoices) by normalised VIN.
  const byVin = new Map<string, LinkedVehicle>()
  for (const j of jobs) {
    const vin = normVin(j.vin as string | null)
    if (!vin) continue
    if (!byVin.has(vin)) {
      const label = [
        [j.vehicle_make, j.vehicle_model].filter(Boolean).join(" "),
        j.vehicle_year || "",
        j.plate_number ? `· ${j.plate_number}` : "",
        j.customer_name ? `· ${j.customer_name}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim()
      byVin.set(vin, { vin, label: label || "Vehicle", jobCount: 0, invoices: [] })
    }
    byVin.get(vin)!.jobCount += 1
  }

  const jobVin = new Map<string, string>()
  for (const j of jobs) jobVin.set(j.id as string, normVin(j.vin as string | null))

  for (const inv of invoiceRows ?? []) {
    const vin = jobVin.get(inv.job_id as string)
    if (!vin || !byVin.has(vin)) continue
    const total = Number(inv.total) || 0
    const paidAmt = Number(inv.amount_paid) || 0
    byVin.get(vin)!.invoices.push({
      id: inv.id as string,
      invoice_number: inv.invoice_number as string | null,
      job_id: inv.job_id as string | null,
      total,
      amount_paid: paidAmt,
      status: inv.status as string | null,
      issue_date: inv.issue_date as string | null,
      paid: total > 0 && paidAmt >= total - 0.01,
    })
  }

  return Array.from(byVin.values())
}
