import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { getSettings } from "@/lib/settings"
import { AppShell } from "@/components/app-shell"
import { InvoiceReview, type InvoiceHeader, type InvoiceItemRow } from "@/components/invoice-review"
import { ArrowLeft } from "lucide-react"

export const metadata = { title: "Review Invoice · SHWURX Auto Service Center" }

export default async function InvoiceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getShellUser()
  const supabase = await createClient()

  const [{ data: invoice }, { data: items }, { data: suppliers }, { data: inventory }, { data: jobRows }, settings] =
    await Promise.all([
      supabase.from("supplier_invoices").select("*").eq("id", id).maybeSingle(),
      supabase.from("supplier_invoice_items").select("*").eq("invoice_id", id).order("line_no"),
      supabase.from("suppliers").select("id, name").is("deleted_at", null).order("name"),
      supabase
        .from("inventory_items")
        .select("id, name, sku, cost_price, crm_part_id, oem_part_number, supplier_part_number")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("jobs")
        .select("id, job_number, vehicle_make, vehicle_model, plate_number, customer_name")
        .order("created_at", { ascending: false })
        .limit(200),
      getSettings(),
    ])

  if (!invoice) notFound()

  const jobs = (jobRows ?? []).map((j) => ({
    id: j.id as string,
    label: [
      j.job_number,
      [j.vehicle_make, j.vehicle_model].filter(Boolean).join(" "),
      j.plate_number,
      j.customer_name,
    ]
      .filter(Boolean)
      .join(" · "),
  }))

  const raw = (invoice.ocr_raw ?? {}) as Record<string, unknown>
  const rawStr = (k: string) => {
    const v = raw[k]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, method, reference, paid_at")
    .eq("supplier_invoice_id", id)
    .order("paid_at", { ascending: false })

  const header: InvoiceHeader = {
    id: invoice.id,
    doc_number: invoice.doc_number,
    status: invoice.status,
    payment_status: invoice.payment_status,
    supplier_id: invoice.supplier_id,
    supplier_name_raw: invoice.supplier_name_raw,
    supplier_contact: {
      trn: rawStr("supplier_trn"),
      phone: rawStr("supplier_phone"),
      email: rawStr("supplier_email"),
      address: rawStr("supplier_address"),
    },
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    currency: invoice.currency ?? "AED",
    subtotal: Number(invoice.subtotal) || 0,
    discount_amount: Number(invoice.discount_amount) || 0,
    vat_amount: Number(invoice.vat_amount) || 0,
    total: Number(invoice.total) || 0,
    amount_paid: Number(invoice.amount_paid) || 0,
    ocr_confidence: invoice.ocr_confidence !== null ? Number(invoice.ocr_confidence) : null,
    notes: invoice.notes,
    blob_pathname: invoice.blob_pathname,
    file_type: invoice.file_type,
  }

  const itemRows: InvoiceItemRow[] = (items ?? []).map((it) => ({
    id: it.id,
    description: it.description ?? "",
    oem_part_number: it.oem_part_number ?? null,
    supplier_part_number: it.supplier_part_number ?? null,
    quantity: Number(it.quantity) || 0,
    unit: it.unit ?? "pcs",
    unit_cost: Number(it.unit_cost) || 0,
    vat_rate: Number(it.vat_rate) || 5,
    inventory_item_id: it.inventory_item_id,
    match_status: it.match_status,
    job_id: it.job_id ?? null,
    parts_request_id: it.parts_request_id ?? null,
    suggested_job_label: it.job_id ? jobs.find((j) => j.id === it.job_id)?.label ?? null : null,
    suggested_sale_price: Number(it.suggested_sale_price) || 0,
    markup_pct: Number(it.markup_pct) || 0,
    confidence: it.confidence !== null ? Number(it.confidence) : null,
  }))

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-4">
        <Link
          href="/purchasing/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Invoice Capture
        </Link>
        <InvoiceReview
          invoice={header}
          items={itemRows}
          suppliers={suppliers ?? []}
          inventory={inventory ?? []}
          jobs={jobs}
          pricing={{ method: settings.pricing_method, markup: settings.default_markup_pct, vat: settings.vat_rate }}
          payments={payments ?? []}
        />
      </div>
    </AppShell>
  )
}
