import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSessionContext } from "@/lib/rbac/context"
import { AppShell } from "@/components/app-shell"
import { InvoiceForm } from "@/components/invoice-form"
import { VAT_RATE } from "@/lib/constants"

export const metadata = { title: "Edit Invoice · SHWURX Auto Service Center" }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getSessionContext()
  if (ctx?.role !== "owner") redirect(`/invoices/${id}`)

  const user = await getShellUser()
  const supabase = await createClient()
  const { data: inv } = await supabase
    .from("invoices")
    .select("*, jobs(id, job_number, customer_name, customer_mobile, vehicle_year, vehicle_make, vehicle_model, plate_emirate, plate_code, plate_number), invoice_items(*)")
    .eq("id", id)
    .maybeSingle()
  if (!inv) notFound()
  if (inv.status === "cancelled") redirect(`/invoices/${id}`)

  const job = (inv as any).jobs
  const items = ((inv.invoice_items ?? []) as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((it) => ({
      kind: (it.kind === "part" || it.kind === "fee" ? it.kind : "labour") as "part" | "labour" | "fee",
      description: it.description ?? "",
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      billing_type: it.billing_type ?? "normal",
      free_reason: it.free_reason ?? "",
      warranty_value: Number(it.warranty_value) || 0,
      warranty_unit: (it.warranty_unit ?? "") as "" | "days" | "months",
    }))

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">
          Edit Invoice <span className="font-mono">{inv.invoice_number}</span>
        </h1>
        <InvoiceForm
          editInvoiceId={id}
          jobs={job ? [job] : []}
          defaultVat={VAT_RATE}
          prefill={{
            jobId: job?.id ?? "",
            customerName: inv.customer_name ?? "",
            customerMobile: inv.customer_mobile ?? "",
            customerTrn: inv.customer_trn ?? "",
            vehicleDesc: inv.vehicle_desc ?? "",
            plate: inv.plate ?? "",
            dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : "",
            notes: inv.notes ?? "",
            discount: Number(inv.discount) || 0,
            vatRate: Number(inv.vat_rate) || VAT_RATE,
            items,
          }}
        />
      </div>
    </AppShell>
  )
}
