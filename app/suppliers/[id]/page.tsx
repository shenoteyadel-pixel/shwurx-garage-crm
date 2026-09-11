import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"
import { PurchasingTabs } from "@/components/purchasing-tabs"
import { Card } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import {
  SupplierAccountClient,
  type AccountInvoice,
  type AccountPayment,
} from "@/components/supplier-account-client"
import { ArrowLeft, Phone, Mail, Building2 } from "lucide-react"

export const metadata = { title: "Dealer Account · SHWURX Auto Service Center" }

export default async function SupplierAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getShellUser()
  const supabase = await createClient()

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!supplier) notFound()

  const [{ data: invoiceRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select("id, doc_number, invoice_number, invoice_date, status, payment_status, total, amount_paid")
      .eq("supplier_id", id)
      .is("deleted_at", null)
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, method, reference, paid_at, created_at, supplier_invoices!inner(supplier_id, doc_number, invoice_number)")
      .eq("direction", "out")
      .eq("supplier_invoices.supplier_id", id)
      .order("paid_at", { ascending: false })
      .limit(200),
  ])

  const invoices: AccountInvoice[] = (invoiceRows ?? []).map((i) => ({
    id: i.id,
    doc_number: i.doc_number,
    invoice_number: i.invoice_number,
    invoice_date: i.invoice_date,
    status: i.status,
    payment_status: i.payment_status,
    total: Number(i.total) || 0,
    amount_paid: Number(i.amount_paid) || 0,
  }))

  const payments: AccountPayment[] = (paymentRows ?? []).map((p: any) => ({
    id: p.id,
    amount: Number(p.amount) || 0,
    method: p.method,
    reference: p.reference,
    paid_at: p.paid_at,
    created_at: p.created_at,
    invoice_label: p.supplier_invoices?.doc_number || p.supplier_invoices?.invoice_number || null,
  }))

  // Account balance: opening balance + confirmed bills − everything paid against them.
  const confirmed = invoices.filter((i) => i.status === "confirmed")
  const billed = confirmed.reduce((t, i) => t + i.total, 0)
  const paid = confirmed.reduce((t, i) => t + i.amount_paid, 0)
  const opening = Number(supplier.opening_balance) || 0
  const outstanding = opening + billed - paid

  const canRecord = user.permissions.includes("purchase_orders.manage")

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Suppliers
        </Link>

        <PurchasingTabs perms={user.permissions} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-balance">{supplier.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {supplier.contact_person && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {supplier.contact_person}
                </span>
              )}
              {supplier.mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {supplier.mobile}
                </span>
              )}
              {supplier.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {supplier.email}
                </span>
              )}
              {supplier.credit_terms && <span>Terms: {supplier.credit_terms}</span>}
              {supplier.trn && <span>TRN {supplier.trn}</span>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total billed" value={formatCurrency(billed)} />
          <Stat label="Total paid" value={formatCurrency(paid)} tone="emerald" />
          <Stat
            label="Outstanding"
            value={formatCurrency(outstanding)}
            tone={outstanding > 0.01 ? "amber" : "emerald"}
          />
          <Stat label="Opening balance" value={formatCurrency(opening)} />
        </div>

        <SupplierAccountClient invoices={invoices} payments={payments} canRecord={canRecord} />
      </div>
    </AppShell>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" }) {
  const toneClass = tone === "amber" ? "text-amber-400" : tone === "emerald" ? "text-emerald-400" : ""
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </Card>
  )
}
