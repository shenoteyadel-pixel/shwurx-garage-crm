"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  return { supabase, user }
}

const num = (v: FormDataEntryValue | null, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const str = (v: FormDataEntryValue | null) => (v ? String(v) : "") || null

/* ============================ Settings ============================ */
export async function saveSettings(formData: FormData) {
  const { supabase } = await requireUser()
  const patch = {
    company_name: String(formData.get("company_name") || "SHWURX Garage"),
    legal_name: str(formData.get("legal_name")),
    trn: str(formData.get("trn")),
    address: str(formData.get("address")),
    phone: str(formData.get("phone")),
    email: str(formData.get("email")),
    website: str(formData.get("website")),
    logo_url: str(formData.get("logo_url")),
    footer_note: str(formData.get("footer_note")),
    labour_rate_default: num(formData.get("labour_rate_default")),
    quotation_validity_days: num(formData.get("quotation_validity_days"), 14),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from("settings").update(patch).eq("id", 1)
  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

/* ============================ Suppliers ============================ */
export async function saveSupplier(formData: FormData) {
  const { supabase, user } = await requireUser()
  const id = str(formData.get("id"))
  const payload = {
    name: String(formData.get("name") || ""),
    contact_person: str(formData.get("contact_person")),
    mobile: str(formData.get("mobile")),
    whatsapp: str(formData.get("whatsapp")),
    email: str(formData.get("email")),
    trn: str(formData.get("trn")),
    address: str(formData.get("address")),
    brands: str(formData.get("brands")),
    credit_terms: str(formData.get("credit_terms")),
    opening_balance: num(formData.get("opening_balance")),
    notes: str(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }
  if (id) {
    const { error } = await supabase.from("suppliers").update(payload).eq("id", id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from("suppliers").insert({ ...payload, created_by: user.id })
    if (error) throw new Error(error.message)
  }
  revalidatePath("/suppliers")
}

export async function deleteSupplier(id: string) {
  const { supabase } = await requireUser()
  await supabase.from("suppliers").delete().eq("id", id)
  revalidatePath("/suppliers")
}

/* ============================ Inventory ============================ */
export async function saveInventoryItem(formData: FormData) {
  const { supabase } = await requireUser()
  const id = str(formData.get("id"))
  const payload = {
    sku: str(formData.get("sku")),
    name: String(formData.get("name") || ""),
    category: str(formData.get("category")),
    brand: str(formData.get("brand")),
    unit: String(formData.get("unit") || "pcs"),
    cost_price: num(formData.get("cost_price")),
    sale_price: num(formData.get("sale_price")),
    reorder_level: num(formData.get("reorder_level")),
    location: str(formData.get("location")),
    supplier_id: str(formData.get("supplier_id")),
    notes: str(formData.get("notes")),
    updated_at: new Date().toISOString(),
  }
  if (id) {
    // Never overwrite quantity directly here — quantity changes go through movements.
    const { error } = await supabase.from("inventory_items").update(payload).eq("id", id)
    if (error) throw new Error(error.message)
  } else {
    const opening = num(formData.get("quantity"))
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({ ...payload, quantity: opening })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    if (opening > 0) {
      await supabase.from("stock_movements").insert({
        item_id: data.id,
        kind: "in",
        quantity: opening,
        unit_cost: payload.cost_price,
        reference: "Opening stock",
      })
    }
  }
  revalidatePath("/inventory")
}

export async function deleteInventoryItem(id: string) {
  const { supabase } = await requireUser()
  await supabase.from("inventory_items").delete().eq("id", id)
  revalidatePath("/inventory")
}

// Record a stock movement and adjust the item quantity atomically-ish.
export async function recordStockMovement(formData: FormData) {
  const { supabase, user } = await requireUser()
  const itemId = String(formData.get("item_id") || "")
  const kind = String(formData.get("kind") || "in") as "in" | "out" | "adjust"
  const qty = num(formData.get("quantity"))
  if (!itemId || qty <= 0) throw new Error("Item and a positive quantity are required")

  const { data: item, error: readErr } = await supabase
    .from("inventory_items")
    .select("quantity, cost_price")
    .eq("id", itemId)
    .single()
  if (readErr) throw new Error(readErr.message)

  const current = Number(item.quantity) || 0
  let nextQty = current
  if (kind === "in") nextQty = current + qty
  else if (kind === "out") nextQty = Math.max(0, current - qty)
  else nextQty = qty // adjust = set absolute count

  await supabase.from("stock_movements").insert({
    item_id: itemId,
    kind,
    quantity: kind === "adjust" ? nextQty - current : qty,
    unit_cost: num(formData.get("unit_cost"), Number(item.cost_price) || 0),
    reference: str(formData.get("reference")),
    note: str(formData.get("note")),
    created_by: user.id,
  })
  await supabase
    .from("inventory_items")
    .update({ quantity: nextQty, updated_at: new Date().toISOString() })
    .eq("id", itemId)

  revalidatePath("/inventory")
}

/* ============================ Purchase Orders ============================ */
type POLine = { description: string; item_id?: string | null; quantity: number; unit_cost: number }

export async function createPurchaseOrder(payload: {
  supplierId: string | null
  jobId: string | null
  expectedDate: string | null
  vatRate: number
  notes: string
  items: POLine[]
}) {
  const { supabase, user } = await requireUser()
  const vatRate = Number.isFinite(payload.vatRate) ? payload.vatRate : 5
  const lines = payload.items.filter((l) => l.description.trim())
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0)
  const vat = (subtotal * vatRate) / 100
  const total = subtotal + vat

  const { data: poNum } = await supabase.rpc("next_doc_number", { p_type: "po", p_prefix: "PO" })

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNum || `PO-${Date.now()}`,
      supplier_id: payload.supplierId,
      job_id: payload.jobId,
      status: "ordered",
      expected_date: payload.expectedDate,
      subtotal,
      vat_amount: vat,
      total,
      notes: payload.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  if (lines.length) {
    const { error: itemErr } = await supabase.from("purchase_order_items").insert(
      lines.map((l) => ({
        po_id: po.id,
        item_id: l.item_id || null,
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        line_total: (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
      })),
    )
    if (itemErr) throw new Error(itemErr.message)
  }
  revalidatePath("/purchasing")
  redirect(`/purchasing/${po.id}`)
}

// Mark a PO received: sets status, records supplier invoice, and adds stock for linked items.
export async function receivePurchaseOrder(poId: string, formData: FormData) {
  const { supabase, user } = await requireUser()
  const supplierInvoiceNo = str(formData.get("supplier_invoice_no"))

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("id, item_id, description, quantity, unit_cost")
    .eq("po_id", poId)

  for (const it of items ?? []) {
    if (!it.item_id) continue
    const { data: inv } = await supabase.from("inventory_items").select("quantity").eq("id", it.item_id).single()
    const nextQty = (Number(inv?.quantity) || 0) + (Number(it.quantity) || 0)
    await supabase.from("inventory_items").update({ quantity: nextQty }).eq("id", it.item_id)
    await supabase.from("stock_movements").insert({
      item_id: it.item_id,
      kind: "in",
      quantity: Number(it.quantity) || 0,
      unit_cost: Number(it.unit_cost) || 0,
      reference: supplierInvoiceNo || "Goods received",
      created_by: user.id,
    })
    await supabase.from("purchase_order_items").update({ received_qty: it.quantity }).eq("id", it.id)
  }

  await supabase
    .from("purchase_orders")
    .update({ status: "received", supplier_invoice_no: supplierInvoiceNo, updated_at: new Date().toISOString() })
    .eq("id", poId)
  revalidatePath("/purchasing")
  revalidatePath(`/purchasing/${poId}`)
}

export async function payPurchaseOrder(poId: string, formData: FormData) {
  const { supabase, user } = await requireUser()
  const amount = num(formData.get("amount"))
  if (amount <= 0) throw new Error("Amount must be positive")
  await supabase.from("payments").insert({
    direction: "out",
    po_id: poId,
    amount,
    method: String(formData.get("method") || "bank"),
    reference: str(formData.get("reference")),
    note: str(formData.get("note")),
    created_by: user.id,
  })
  const { data: po } = await supabase.from("purchase_orders").select("amount_paid").eq("id", poId).single()
  await supabase
    .from("purchase_orders")
    .update({ amount_paid: (Number(po?.amount_paid) || 0) + amount })
    .eq("id", poId)
  revalidatePath(`/purchasing/${poId}`)
  revalidatePath("/purchasing")
}

/* ============================ Invoices ============================ */
type InvLine = { kind: "part" | "labour" | "fee"; description: string; quantity: number; unit_price: number }

function computeInvoice(items: InvLine[], discount: number, vatRate: number) {
  const partsTotal = items.filter((i) => i.kind === "part").reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const labourTotal = items
    .filter((i) => i.kind !== "part")
    .reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const gross = partsTotal + labourTotal
  const subtotal = Math.max(0, gross - discount)
  const vat = (subtotal * vatRate) / 100
  const total = subtotal + vat
  return { partsTotal, labourTotal, subtotal, vat, total }
}

export async function createInvoice(payload: {
  jobId: string | null
  customerName: string
  customerMobile: string
  customerTrn: string
  vehicleDesc: string
  plate: string
  dueDate: string | null
  discount: number
  vatRate: number
  notes: string
  items: InvLine[]
}) {
  const { supabase, user } = await requireUser()
  const vatRate = Number.isFinite(payload.vatRate) ? payload.vatRate : 5
  const lines = payload.items.filter((l) => l.description.trim())
  const t = computeInvoice(lines, payload.discount || 0, vatRate)

  const { data: invNum } = await supabase.rpc("next_doc_number", { p_type: "invoice", p_prefix: "INV" })

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invNum || `INV-${Date.now()}`,
      job_id: payload.jobId,
      customer_name: payload.customerName || null,
      customer_mobile: payload.customerMobile || null,
      customer_trn: payload.customerTrn || null,
      vehicle_desc: payload.vehicleDesc || null,
      plate: payload.plate || null,
      status: "unpaid",
      due_date: payload.dueDate,
      parts_total: t.partsTotal,
      labour_total: t.labourTotal,
      discount: payload.discount || 0,
      subtotal: t.subtotal,
      vat_rate: vatRate,
      vat_amount: t.vat,
      total: t.total,
      notes: payload.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  if (lines.length) {
    await supabase.from("invoice_items").insert(
      lines.map((l, idx) => ({
        invoice_id: inv.id,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
        sort_order: idx,
      })),
    )
  }
  revalidatePath("/invoices")
  redirect(`/invoices/${inv.id}`)
}

export async function recordInvoicePayment(invoiceId: string, formData: FormData) {
  const { supabase, user } = await requireUser()
  const amount = num(formData.get("amount"))
  if (amount <= 0) throw new Error("Amount must be positive")

  await supabase.from("payments").insert({
    direction: "in",
    invoice_id: invoiceId,
    amount,
    method: String(formData.get("method") || "cash"),
    reference: str(formData.get("reference")),
    note: str(formData.get("note")),
    created_by: user.id,
  })

  const { data: inv } = await supabase
    .from("invoices")
    .select("amount_paid, total")
    .eq("id", invoiceId)
    .single()
  const paid = (Number(inv?.amount_paid) || 0) + amount
  const total = Number(inv?.total) || 0
  const status = paid >= total - 0.01 ? "paid" : paid > 0 ? "partial" : "unpaid"
  await supabase
    .from("invoices")
    .update({ amount_paid: paid, status, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
}

export async function cancelInvoice(invoiceId: string) {
  const { supabase } = await requireUser()
  await supabase.from("invoices").update({ status: "cancelled" }).eq("id", invoiceId)
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
}
