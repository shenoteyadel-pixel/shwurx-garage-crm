import type { createClient } from "@/lib/supabase/server"
import { VAT_RATE } from "@/lib/constants"

type Supabase = Awaited<ReturnType<typeof createClient>>

export const ADDON_TYPES = ["washing", "pickup", "delivery"] as const
export type AddonType = (typeof ADDON_TYPES)[number]

export const ADDON_LABELS: Record<AddonType, string> = {
  washing: "Car Wash",
  pickup: "Vehicle Pickup",
  delivery: "Vehicle Delivery",
}

export const ADDON_DESCRIPTIONS: Record<AddonType, string> = {
  washing: "Exterior & interior wash",
  pickup: "Collection from customer location",
  delivery: "Return to customer location",
}

export type JobAddon = {
  id: string
  job_id: string
  type: AddonType
  enabled: boolean
  billable: boolean
  price: number
  status: "pending" | "completed"
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Re-materialise the job's add-on services (wash / pickup / delivery) as tagged
 * lines on its quotation, then recompute the quotation header. Add-ons are the
 * single source of truth; every quote/invoice/approval read path already reads
 * `quotation_items`, so keeping these lines in sync makes add-ons flow through
 * the whole billing chain automatically — one service, one line, no duplicates.
 *
 * Lines are marked with `addon_type` so they can be found and refreshed without
 * ever being confused with hand-entered quote items.
 */
export async function resyncQuotationAddons(
  supabase: Supabase,
  jobId: string,
  opts: { createIfMissing?: boolean } = {},
) {
  const { data: addonRows } = await supabase.from("job_addons").select("*").eq("job_id", jobId)
  const enabled = ((addonRows as JobAddon[] | null) ?? []).filter((a) => a.enabled)

  let { data: quote } = await supabase
    .from("quotations")
    .select("id, vat_rate, vat_inclusive")
    .eq("job_id", jobId)
    .maybeSingle()

  if (!quote) {
    // Only spin up a quotation when there is actually an add-on to bill and the
    // caller opted in (e.g. staff toggled an add-on before any quote exists).
    if (!opts.createIfMissing || enabled.length === 0) return
    const { data: created, error } = await supabase
      .from("quotations")
      .insert({
        job_id: jobId,
        vat_rate: VAT_RATE,
        vat_inclusive: false,
        parts_total: 0,
        labor_total: 0,
        discount_total: 0,
        subtotal: 0,
        vat_amount: 0,
        total: 0,
      })
      .select("id, vat_rate, vat_inclusive")
      .single()
    if (error) throw new Error(error.message)
    quote = created
  }

  // Clear the previously materialised add-on lines (never touches real quote items).
  await supabase.from("quotation_items").delete().eq("quotation_id", quote.id).not("addon_type", "is", null)

  const vatRate = Number(quote.vat_rate) || 0
  const vatInclusive = Boolean(quote.vat_inclusive)

  const lines = enabled.map((a, idx) => {
    const price = a.billable ? Number(a.price) || 0 : 0
    let net: number
    let vat: number
    let lineTotal: number
    if (vatInclusive) {
      lineTotal = price
      net = price / (1 + vatRate / 100)
      vat = price - net
    } else {
      net = price
      vat = (price * vatRate) / 100
      lineTotal = price + vat
    }
    return {
      quotation_id: quote!.id,
      kind: "labor" as const,
      name: ADDON_LABELS[a.type],
      part_number: null,
      detail: a.billable ? ADDON_DESCRIPTIONS[a.type] : `${ADDON_DESCRIPTIONS[a.type]} — Complimentary`,
      description: ADDON_LABELS[a.type],
      quantity: 1,
      unit_price: 0,
      labour_hours: 0,
      labour_rate: price,
      labor: 0,
      discount: 0,
      vat,
      line_total: lineTotal,
      category: "Add-on Services",
      recommendation: "required" as const,
      addon_type: a.type,
      sort_order: 1000 + idx,
    }
  })

  if (lines.length) {
    const { error } = await supabase.from("quotation_items").insert(lines)
    if (error) throw new Error(error.message)
  }

  // Recompute the header from every line. subtotal = total - vat always holds,
  // so the printed subtotal/VAT/total stay exact regardless of VAT mode.
  const { data: allItems } = await supabase
    .from("quotation_items")
    .select("kind, vat, line_total, discount")
    .eq("quotation_id", quote.id)
  const items = (allItems as { kind: string; vat: number; line_total: number; discount: number }[] | null) ?? []

  const vatAmount = items.reduce((s, i) => s + (Number(i.vat) || 0), 0)
  const total = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0)
  const discountTotal = items.reduce((s, i) => s + (Number(i.discount) || 0), 0)
  const subtotal = total - vatAmount
  const partsTotal = items
    .filter((i) => i.kind === "part")
    .reduce((s, i) => s + ((Number(i.line_total) || 0) - (Number(i.vat) || 0)), 0)
  const laborTotal = items
    .filter((i) => i.kind !== "part")
    .reduce((s, i) => s + ((Number(i.line_total) || 0) - (Number(i.vat) || 0)), 0)

  await supabase
    .from("quotations")
    .update({
      parts_total: partsTotal,
      labor_total: laborTotal,
      discount_total: discountTotal,
      subtotal,
      vat_amount: vatAmount,
      total,
    })
    .eq("id", quote.id)
}
