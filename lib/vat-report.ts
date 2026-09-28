import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

export const EMIRATES = [
  { box: "1a", name: "Abu Dhabi" },
  { box: "1b", name: "Dubai" },
  { box: "1c", name: "Sharjah" },
  { box: "1d", name: "Ajman" },
  { box: "1e", name: "Umm Al Quwain" },
  { box: "1f", name: "Ras Al Khaimah" },
  { box: "1g", name: "Fujairah" },
] as const

/** Workshop services are performed in Dubai, so the place of supply for sales is Dubai (Box 1b). */
export const PLACE_OF_SUPPLY = "Dubai"

export type VatBox = { box: string; label: string; amount: number; vat: number; adjustment?: number }

export type SalesLine = {
  number: string
  date: string
  customer: string
  customerTrn: string | null
  net: number
  vat: number
  total: number
  treatment: "standard" | "zero"
}

export type PurchaseLine = {
  number: string
  date: string
  supplier: string
  supplierTrn: string | null
  net: number
  vat: number
  total: number
  recoverable: boolean
  reason?: string
}

export type VatReport = {
  from: string
  to: string
  outputBoxes: VatBox[]
  inputBoxes: VatBox[]
  box8: { amount: number; vat: number }
  box11: { amount: number; vat: number }
  box12: number
  box13: number
  box14: number
  sales: SalesLine[]
  purchases: PurchaseLine[]
  blockedInputVat: number
  blockedCount: number
}

const n = (v: unknown) => Number(v) || 0
const r2 = (v: number) => Math.round(v * 100) / 100
/** UAE TRNs are 15 digits. Input VAT is only recoverable against a valid tax invoice (Art. 55 Executive Regulation). */
export const isValidTrn = (trn: string | null | undefined) => !!trn && /^\d{15}$/.test(trn.replace(/\s|-/g, ""))

export async function loadVatReport(supabase: SupabaseClient, from: string, to: string): Promise<VatReport> {
  const [{ data: invoices }, { data: bills }, { data: pos }] = await Promise.all([
    supabase
      .from("invoices")
      .select("invoice_number, issue_date, customer_name, customer_trn, subtotal, vat_amount, total, status")
      .neq("status", "cancelled")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date"),
    supabase
      .from("supplier_invoices")
      .select("doc_number, invoice_number, invoice_date, supplier_name_raw, subtotal, vat_amount, total, suppliers(name, trn)")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date"),
    supabase
      .from("purchase_orders")
      .select("po_number, supplier_invoice_no, order_date, subtotal, vat_amount, total, suppliers(name, trn)")
      .neq("status", "cancelled")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date"),
  ])

  const sales: SalesLine[] = (invoices ?? []).map((i) => {
    const vat = n(i.vat_amount)
    return {
      number: i.invoice_number,
      date: i.issue_date,
      customer: i.customer_name ?? "",
      customerTrn: i.customer_trn ?? null,
      net: n(i.subtotal),
      vat,
      total: n(i.total),
      treatment: vat > 0 ? "standard" : "zero",
    }
  })

  const toPurchase = (
    number: string,
    date: string,
    supplier: { name?: string; trn?: string | null } | null,
    rawName: string | null,
    net: unknown,
    vat: unknown,
    total: unknown,
  ): PurchaseLine => {
    const v = n(vat)
    const trn = supplier?.trn ?? null
    let reason: string | undefined
    if (v <= 0) reason = "No VAT charged"
    else if (!isValidTrn(trn)) reason = "Supplier TRN missing or invalid"
    return {
      number,
      date,
      supplier: supplier?.name ?? rawName ?? "Unknown supplier",
      supplierTrn: trn,
      net: n(net),
      vat: v,
      total: n(total),
      recoverable: !reason,
      reason,
    }
  }

  const purchases: PurchaseLine[] = [
    ...(bills ?? []).map((b: any) =>
      toPurchase(b.invoice_number || b.doc_number, b.invoice_date, b.suppliers, b.supplier_name_raw, b.subtotal, b.vat_amount, b.total),
    ),
    ...(pos ?? []).map((p: any) =>
      toPurchase(p.supplier_invoice_no || p.po_number, p.order_date, p.suppliers, null, p.subtotal, p.vat_amount, p.total),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const standard = sales.filter((s) => s.treatment === "standard")
  const zero = sales.filter((s) => s.treatment === "zero")
  const sum = (rows: { net: number; vat: number }[]) => ({
    amount: r2(rows.reduce((s, x) => s + x.net, 0)),
    vat: r2(rows.reduce((s, x) => s + x.vat, 0)),
  })
  const std = sum(standard)

  const outputBoxes: VatBox[] = [
    ...EMIRATES.map((e) => ({
      box: e.box,
      label: `Standard rated supplies in ${e.name}`,
      amount: e.name === PLACE_OF_SUPPLY ? std.amount : 0,
      vat: e.name === PLACE_OF_SUPPLY ? std.vat : 0,
      adjustment: 0,
    })),
    { box: "2", label: "Tax refunds provided to tourists under the Tax Refunds for Tourists Scheme", amount: 0, vat: 0 },
    { box: "3", label: "Supplies subject to the reverse charge provisions", amount: 0, vat: 0 },
    { box: "4", label: "Zero rated supplies", amount: sum(zero).amount, vat: 0 },
    { box: "5", label: "Exempt supplies", amount: 0, vat: 0 },
    { box: "6", label: "Goods imported into the UAE", amount: 0, vat: 0 },
    { box: "7", label: "Adjustments to goods imported into the UAE", amount: 0, vat: 0 },
  ]
  const box8 = {
    amount: r2(outputBoxes.reduce((s, b) => s + b.amount, 0)),
    vat: r2(outputBoxes.reduce((s, b) => s + b.vat + (b.adjustment ?? 0), 0)),
  }

  const recoverable = purchases.filter((p) => p.recoverable)
  const blocked = purchases.filter((p) => !p.recoverable && p.vat > 0)
  const rec = sum(recoverable)
  const inputBoxes: VatBox[] = [
    { box: "9", label: "Standard rated expenses", amount: rec.amount, vat: rec.vat, adjustment: 0 },
    { box: "10", label: "Supplies subject to the reverse charge provisions", amount: 0, vat: 0, adjustment: 0 },
  ]
  const box11 = {
    amount: r2(inputBoxes.reduce((s, b) => s + b.amount, 0)),
    vat: r2(inputBoxes.reduce((s, b) => s + b.vat + (b.adjustment ?? 0), 0)),
  }

  return {
    from,
    to,
    outputBoxes,
    inputBoxes,
    box8,
    box11,
    box12: box8.vat,
    box13: box11.vat,
    box14: r2(box8.vat - box11.vat),
    sales,
    purchases,
    blockedInputVat: r2(blocked.reduce((s, p) => s + p.vat, 0)),
    blockedCount: blocked.length,
  }
}

/** Current FTA-style calendar quarter (YYYY-MM-DD bounds). */
export function currentQuarter(now = new Date()) {
  const q = Math.floor(now.getMonth() / 3)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { from: fmt(new Date(now.getFullYear(), q * 3, 1)), to: fmt(new Date(now.getFullYear(), q * 3 + 3, 0)) }
}
