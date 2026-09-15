import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { InvoiceForm } from "@/components/invoice-form"
import { VAT_RATE } from "@/lib/constants"

export const metadata = { title: "New Invoice · SHWURX Auto Service Center" }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>
}) {
  const { job } = await searchParams
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_number, customer_name, customer_mobile, vehicle_year, vehicle_make, vehicle_model, plate_number")
    .order("created_at", { ascending: false })
    .limit(200)

  // Prefill from a job's latest quotation when arriving via ?job=
  let prefill: any = null
  if (job) {
    const { data: j } = await supabase
      .from("jobs")
      .select("id, job_number, customer_name, customer_mobile, vehicle_year, vehicle_make, vehicle_model, plate_number")
      .eq("id", job)
      .maybeSingle()
    const { data: quote } = await supabase
      .from("quotations")
      .select("vat_rate, discount_total, quotation_items(kind, name, description, quantity, unit_price, labour_hours, labour_rate)")
      .eq("job_id", job)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (j) {
      const items = ((quote?.quotation_items ?? []) as any[]).map((it) => {
        const isPart = it.kind === "part"
        const qty = isPart ? Number(it.quantity) || 1 : Number(it.labour_hours) > 0 ? Number(it.labour_hours) : 1
        const price = isPart ? Number(it.unit_price) || 0 : Number(it.labour_rate) || 0
        return {
          kind: isPart ? "part" : "labour",
          description: it.name || it.description || (isPart ? "Part" : "Labour"),
          quantity: qty,
          unit_price: price,
        }
      })

      // Also pull in any additional-work items the customer approved after the
      // quotation was locked, so this single invoice reflects everything signed
      // off for the job. Only items the customer actually approved are included.
      const { data: awReqs } = await supabase
        .from("approval_requests")
        .select("id, mode, snapshot")
        .eq("job_id", job)
        .eq("kind", "additional_work")
        .in("status", ["approved", "partial"])

      if (awReqs?.length) {
        const { data: decisions } = await supabase
          .from("approval_item_decisions")
          .select("approval_request_id, item_key, decision")
          .in(
            "approval_request_id",
            awReqs.map((r) => r.id),
          )

        const approvedByReq = new Map<string, Set<string>>()
        for (const d of decisions ?? []) {
          if (d.decision !== "approved") continue
          const set = approvedByReq.get(d.approval_request_id) ?? new Set<string>()
          set.add(d.item_key)
          approvedByReq.set(d.approval_request_id, set)
        }

        for (const req of awReqs) {
          const approvedKeys = approvedByReq.get(req.id) ?? new Set<string>()
          const wholeApproved = req.mode === "whole" && approvedKeys.has("__whole__")
          const snapItems = (((req.snapshot as any)?.items ?? []) as any[]) ?? []
          for (const it of snapItems) {
            if (!wholeApproved && !approvedKeys.has(it.key)) continue
            const isPart = it.kind === "part"
            const qty = isPart ? Number(it.quantity) || 1 : Number(it.labour_hours) > 0 ? Number(it.labour_hours) : 1
            const price = isPart ? Number(it.unit_price) || 0 : Number(it.labour_rate) || 0
            items.push({
              kind: isPart ? "part" : "labour",
              description: it.name || (isPart ? "Part" : "Labour"),
              quantity: qty,
              unit_price: price,
            })
          }
        }
      }

      prefill = {
        jobId: j.id,
        customerName: j.customer_name ?? "",
        customerMobile: j.customer_mobile ?? "",
        vehicleDesc: [j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(" "),
        plate: j.plate_number ?? "",
        discount: Number(quote?.discount_total) || 0,
        vatRate: Number(quote?.vat_rate) || VAT_RATE,
        items,
      }
    }
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">New Invoice</h1>
        <InvoiceForm jobs={jobs ?? []} prefill={prefill} defaultVat={VAT_RATE} />
      </div>
    </AppShell>
  )
}
