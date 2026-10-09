"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, logCurrent } from "@/lib/rbac/context"
import { findJobDuplicateParts } from "@/lib/part-costs"

const num = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Keeps exactly one line per duplicate group on the job card and removes the
 * rest. `keep` maps each group key to the line the user chose to keep.
 */
export async function resolveDuplicateParts(
  jobId: string,
  keep: Record<string, string>,
): Promise<{ ok: boolean; error?: string; removed?: number }> {
  try {
    await requirePermission("quotations.edit")
    const supabase = await createClient()

    const { data: quote, error } = await supabase
      .from("quotations")
      .select(
        "id, vat_rate, vat_inclusive, quotation_items(id, kind, name, description, part_number, detail, quantity, unit_price, labour_hours, labour_rate, discount, addon_type, sort_order)",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!quote) return { ok: false, error: "This job card has no quotation." }

    const items = (quote.quotation_items as any[]) ?? []
    const groups = await findJobDuplicateParts(supabase, jobId, items)
    if (groups.length === 0) return { ok: true, removed: 0 }

    const removeIds: string[] = []
    const keptUpdates: { id: string; patch: { part_number?: string; detail?: string } }[] = []
    for (const g of groups) {
      const chosen = keep[g.key]
      const keepId = g.lines.some((l) => l.id === chosen) ? chosen : g.defaultKeepId
      const kept = g.lines.find((l) => l.id === keepId)!
      const others = g.lines.filter((l) => l.id !== keepId)
      for (const l of others) removeIds.push(l.id)

      // Carry the purchase reference and part number onto the surviving line so
      // the job card still shows where the part was bought.
      const patch: { part_number?: string; detail?: string } = {}
      const pn = others.find((l) => l.partNumber)?.partNumber
      if (!kept.partNumber && pn) patch.part_number = pn
      const invoiceDetail = others.find((l) => l.fromInvoice)?.detail
      if (!kept.fromInvoice && invoiceDetail) {
        patch.detail = kept.detail ? `${kept.detail} · ${invoiceDetail}` : invoiceDetail
      }
      if (Object.keys(patch).length) keptUpdates.push({ id: keepId, patch })
    }
    if (removeIds.length === 0) return { ok: true, removed: 0 }

    for (const u of keptUpdates) {
      const { error: upErr } = await supabase
        .from("quotation_items")
        .update(u.patch)
        .eq("quotation_id", quote.id)
        .eq("id", u.id)
      if (upErr) throw new Error(upErr.message)
    }

    const { error: delErr } = await supabase
      .from("quotation_items")
      .delete()
      .eq("quotation_id", quote.id)
      .in("id", removeIds)
    if (delErr) throw new Error(delErr.message)

    const vatRate = num(quote.vat_rate)
    const inclusive = Boolean(quote.vat_inclusive)
    const sums = items
      .filter((i) => !removeIds.includes(i.id))
      .reduce(
        (acc, i) => {
          const hours = num(i.labour_hours)
          const rate = num(i.labour_rate)
          const isLabor = i.kind === "labor"
          const gross = isLabor ? (hours > 0 ? hours * rate : rate) : num(i.quantity) * num(i.unit_price)
          const discount = num(i.discount)
          const base = Math.max(0, gross - discount)
          const net = inclusive ? base / (1 + vatRate / 100) : base
          const vat = inclusive ? base - net : (base * vatRate) / 100
          const contrib = inclusive ? net : gross
          if (isLabor) acc.labor += contrib
          else acc.parts += contrib
          acc.discount += discount
          acc.vat += vat
          return acc
        },
        { parts: 0, labor: 0, discount: 0, vat: 0 },
      )
    const subtotal = inclusive ? sums.parts + sums.labor : sums.parts + sums.labor - sums.discount
    const { error: totErr } = await supabase
      .from("quotations")
      .update({
        parts_total: sums.parts,
        labor_total: sums.labor,
        discount_total: sums.discount,
        subtotal,
        vat_amount: sums.vat,
        total: subtotal + sums.vat,
      })
      .eq("id", quote.id)
    if (totErr) throw new Error(totErr.message)

    await logCurrent("quotation.merge_duplicates", "job", jobId, { removed: removeIds.length })
    revalidatePath(`/jobs/${jobId}`)
    return { ok: true, removed: removeIds.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the parts." }
  }
}
