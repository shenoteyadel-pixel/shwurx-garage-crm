"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logCurrent } from "@/lib/rbac/context"
import { notifyOwners, notifyUser } from "@/lib/actions-notifications"
import { createAdditionalWorkRequest } from "@/lib/actions-approvals"
import { getSettings } from "@/lib/settings"
import { canPayout, computeLine, recommend } from "@/lib/addon-commission"
import { getAddonPolicy, loadLedger, syncAddonSales, type AddonSaleRow } from "@/lib/addon-sales-data"

type Result = { ok: true } | { ok: false; error: string }

const fail = (error: string): Result => ({ ok: false, error })
const num = (v: unknown, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const text = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max)

/* ---------------- Catalog (admin only) ---------------- */

export type CatalogInput = {
  id?: string
  code: string
  name: string
  description?: string
  category: string
  kind: "product" | "service"
  supplier_id?: string | null
  inventory_item_id?: string | null
  purchase_cost: number
  extra_cost: number
  selling_price: number
  commission_pct: number
  commission_eligible: boolean
  compatible_makes?: string
  interval_km?: number | null
  interval_months?: number | null
  active: boolean
}

export async function saveCatalogItem(input: CatalogInput): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()
  const row = {
    code: text(input.code, 40).toUpperCase(),
    name: text(input.name, 120),
    description: text(input.description, 1000) || null,
    category: text(input.category, 60) || "General",
    kind: input.kind === "product" ? "product" : "service",
    supplier_id: input.supplier_id || null,
    inventory_item_id: input.inventory_item_id || null,
    purchase_cost: Math.max(0, num(input.purchase_cost)),
    extra_cost: Math.max(0, num(input.extra_cost)),
    selling_price: Math.max(0, num(input.selling_price)),
    commission_pct: Math.min(100, Math.max(0, num(input.commission_pct, 25))),
    commission_eligible: Boolean(input.commission_eligible),
    compatible_makes: text(input.compatible_makes, 300) || null,
    interval_km: input.interval_km && num(input.interval_km) > 0 ? Math.round(num(input.interval_km)) : null,
    interval_months: input.interval_months && num(input.interval_months) > 0 ? Math.round(num(input.interval_months)) : null,
    active: Boolean(input.active),
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }
  if (!row.code || !row.name) return fail("Code and name are required.")

  let before: any = null
  if (input.id) {
    const { data } = await svc.from("addon_catalog").select("*").eq("id", input.id).maybeSingle()
    before = data
    const { error } = await svc.from("addon_catalog").update(row).eq("id", input.id)
    if (error) return fail(error.code === "23505" ? "That code is already used." : error.message)
  } else {
    const { error } = await svc.from("addon_catalog").insert(row)
    if (error) return fail(error.code === "23505" ? "That code is already used." : error.message)
  }

  const tracked = ["purchase_cost", "extra_cost", "selling_price", "commission_pct", "commission_eligible", "active"] as const
  const changes = before
    ? Object.fromEntries(tracked.filter((k) => String(before[k]) !== String(row[k])).map((k) => [k, { from: before[k], to: row[k] }]))
    : null
  await logCurrent(input.id ? "addon.catalog.update" : "addon.catalog.create", "addon_catalog", input.id ?? row.code, {
    code: row.code,
    changes,
  })

  if (row.selling_price < row.purchase_cost + row.extra_cost) {
    await notifyOwners({
      title: "Add-on priced below cost",
      body: `${row.name} sells for AED ${row.selling_price.toFixed(2)} but costs AED ${(row.purchase_cost + row.extra_cost).toFixed(2)}. It will earn no commission.`,
      type: "addon",
      link: "/settings/addon-catalog",
    })
  }
  revalidatePath("/settings/addon-catalog")
  return { ok: true }
}

/* ---------------- Job lines ---------------- */

export async function addAddonToJob(jobId: string, catalogId: string, overrideNote?: string): Promise<Result> {
  const ctx = await requirePermission("quotations.edit")
  const svc = createServiceClient()
  const [{ data: item }, { data: job }] = await Promise.all([
    svc.from("addon_catalog").select("*").eq("id", catalogId).eq("active", true).maybeSingle(),
    svc.from("jobs").select("id, stage, mileage, vehicle_make, vehicle_id").eq("id", jobId).maybeSingle(),
  ])
  if (!item) return fail("This add-on is not available.")
  if (!job) return fail("Job not found.")
  if (job.stage === "delivered") return fail("This job is already delivered.")

  let last: { mileage: number | null; date: string } | null = null
  if (job.vehicle_id) {
    const { data: prevJobs } = await svc.from("jobs").select("id, mileage").eq("vehicle_id", job.vehicle_id).neq("id", jobId)
    const ids = (prevJobs ?? []).map((j) => j.id)
    if (ids.length) {
      const { data: done } = await svc
        .from("addon_sales")
        .select("job_id, completed_at")
        .eq("catalog_id", catalogId)
        .eq("status", "completed")
        .in("job_id", ids)
        .order("completed_at", { ascending: false })
        .limit(1)
      if (done?.[0]) {
        last = { mileage: prevJobs!.find((j) => j.id === done[0].job_id)?.mileage ?? null, date: done[0].completed_at }
      }
    }
  }
  const rec = recommend({
    mileage: job.mileage,
    jobMake: job.vehicle_make,
    compatibleMakes: item.compatible_makes,
    intervalKm: item.interval_km,
    intervalMonths: item.interval_months,
    last,
    inspectionText: "",
    name: item.name,
  })
  if (rec.level === "incompatible") return fail(`${item.name} is not listed as compatible with ${job.vehicle_make}.`)
  const note = text(overrideNote, 500)
  if (rec.level === "recent" && !note) return fail(`${rec.reason}. Add a note explaining why it's needed again.`)

  const { data: advisorRate } = await svc
    .from("addon_advisor_rates")
    .select("commission_pct")
    .eq("advisor_id", ctx.userId)
    .maybeSingle()
  const commissionPct = advisorRate ? Number(advisorRate.commission_pct) : Number(item.commission_pct)
  const line = computeLine({
    quantity: 1,
    unitPrice: item.selling_price,
    unitCost: item.purchase_cost,
    unitExtraCost: item.extra_cost,
    discount: 0,
    commissionPct,
    commissionEligible: item.commission_eligible,
  })
  const { error } = await svc.from("addon_sales").insert({
    job_id: jobId,
    catalog_id: catalogId,
    advisor_id: ctx.userId,
    status: "draft",
    name: item.name,
    category: item.category,
    kind: item.kind,
    quantity: 1,
    unit_price: item.selling_price,
    unit_cost: item.purchase_cost,
    unit_extra_cost: item.extra_cost,
    original_amount: line.originalAmount,
    discount: 0,
    net_amount: line.netAmount,
    commission_pct: commissionPct,
    commission_eligible: item.commission_eligible,
    rate_override_reason: advisorRate ? "Advisor rate" : null,
    notes: note || null,
  })
  if (error) return fail(error.code === "23505" ? `${item.name} is already on this job.` : error.message)
  await logCurrent("addon.sale.add", "job", jobId, { item: item.code, recommendation: rec.level })
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true }
}

async function loadSale(id: string) {
  const svc = createServiceClient()
  const { data } = await svc.from("addon_sales").select("*").eq("id", id).maybeSingle()
  return { svc, sale: data as AddonSaleRow | null }
}

export async function updateAddonLine(
  id: string,
  input: { quantity: number; discount: number; recommendation: string; notes: string; evidence_url: string },
): Promise<Result> {
  const ctx = await requirePermission("quotations.edit")
  const { svc, sale } = await loadSale(id)
  if (!sale) return fail("Line not found.")
  if (sale.status !== "draft") return fail("Only draft lines can be edited. Cancel and re-add to change a sent line.")

  const quantity = Math.max(0.01, Math.round(num(input.quantity, 1) * 100) / 100)
  const line = computeLine({
    quantity,
    unitPrice: sale.unit_price,
    unitCost: sale.unit_cost,
    unitExtraCost: sale.unit_extra_cost,
    discount: num(input.discount),
    commissionPct: sale.commission_pct,
    commissionEligible: sale.commission_eligible,
  })
  const discountPct = line.originalAmount > 0 ? (line.discount / line.originalAmount) * 100 : 0
  const { discountAlertPct } = await getAddonPolicy(svc)
  const isAdmin = ctx.permissions.has("settings.manage")
  if (discountPct > discountAlertPct && !isAdmin) {
    await logCurrent("addon.sale.discount_denied", "addon_sale", id, { discountPct: Math.round(discountPct) })
    return fail(`Discounts above ${discountAlertPct}% need an owner. Ask an admin to apply it.`)
  }
  const evidence = text(input.evidence_url, 500)
  if (evidence && !/^https?:\/\//i.test(evidence)) return fail("Evidence must be a link starting with http(s)://")

  const { error } = await svc
    .from("addon_sales")
    .update({
      quantity,
      original_amount: line.originalAmount,
      discount: line.discount,
      net_amount: line.netAmount,
      recommendation: ["required", "recommended", "optional"].includes(input.recommendation) ? input.recommendation : "recommended",
      notes: text(input.notes, 1000) || null,
      evidence_url: evidence || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
  if (error) return fail(error.message)

  if (line.discount !== Number(sale.discount)) {
    await logCurrent("addon.sale.discount", "addon_sale", id, { from: sale.discount, to: line.discount, pct: Math.round(discountPct) })
    if (discountPct > discountAlertPct) {
      await notifyOwners({
        title: "Large add-on discount",
        body: `${Math.round(discountPct)}% off ${sale.name} (AED ${line.discount.toFixed(2)}).`,
        type: "addon",
        link: `/jobs/${sale.job_id}`,
      })
    }
  }
  revalidatePath(`/jobs/${sale.job_id}`)
  return { ok: true }
}

export async function removeDraftAddon(id: string): Promise<Result> {
  await requirePermission("quotations.edit")
  const { svc, sale } = await loadSale(id)
  if (!sale) return fail("Line not found.")
  if (sale.status !== "draft") return fail("Only draft lines can be removed. Cancel sent lines instead.")
  await svc.from("addon_sales").delete().eq("id", id).eq("status", "draft")
  await logCurrent("addon.sale.remove", "job", sale.job_id, { name: sale.name })
  revalidatePath(`/jobs/${sale.job_id}`)
  return { ok: true }
}

/** Sends every draft line on the job to the customer as one additional-work approval. */
export async function sendAddonsForApproval(jobId: string): Promise<Result & { url?: string; emailed?: boolean }> {
  await requirePermission("quotations.edit")
  const svc = createServiceClient()
  const { data } = await svc.from("addon_sales").select("*").eq("job_id", jobId).eq("status", "draft").order("created_at")
  const drafts = (data ?? []) as AddonSaleRow[]
  if (!drafts.length) return fail("Add at least one add-on first.")
  const settings = await getSettings()

  const res = await createAdditionalWorkRequest(jobId, {
    title: drafts.length === 1 ? `Recommended: ${drafts[0].name}` : "Recommended add-on services",
    vatInclusive: false,
    vatRate: Number(settings.vat_rate ?? 5),
    items: drafts.map((s) => {
      const qty = Number(s.quantity)
      const unit = Math.round((Number(s.net_amount) / qty) * 100) / 100
      const detail = [
        s.notes,
        Number(s.discount) > 0 ? `Was AED ${Number(s.original_amount).toFixed(2)}, you save AED ${Number(s.discount).toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      const recommendation = s.recommendation as "required" | "recommended" | "optional"
      return s.kind === "product"
        ? { kind: "part" as const, name: s.name, detail, category: s.category, recommendation, quantity: qty, unit_price: unit, discount: 0 }
        : { kind: "labor" as const, name: s.name, detail, category: s.category, recommendation, labour_hours: qty, labour_rate: unit, discount: 0 }
    }),
  })
  if (!res.ok || !res.token) return fail(res.error ?? "Could not create the approval request.")

  const { data: req } = await svc.from("approval_requests").select("id").eq("token", res.token).maybeSingle()
  if (!req) return fail("Approval was created but could not be linked. Refresh and check the Approvals panel.")
  const now = new Date().toISOString()
  for (const [idx, s] of drafts.entries()) {
    await svc
      .from("addon_sales")
      .update({ status: "proposed", approval_request_id: req.id, item_key: `${req.id}:aw-${idx}`, updated_at: now })
      .eq("id", s.id)
  }
  await logCurrent("addon.sale.send", "job", jobId, { lines: drafts.length, approval_request_id: req.id })
  revalidatePath(`/jobs/${jobId}`)
  return { ok: true, url: res.url, emailed: res.emailed }
}

export async function markAddonCompleted(id: string): Promise<Result> {
  await requirePermission("jobs.assign")
  const { svc, sale } = await loadSale(id)
  if (!sale) return fail("Line not found.")
  if (sale.status !== "approved") return fail("Only approved add-ons can be marked completed.")
  await svc.from("addon_sales").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).eq("status", "approved")
  await logCurrent("addon.sale.complete", "addon_sale", id, { name: sale.name })
  await syncAddonSales([sale.job_id])
  revalidatePath(`/jobs/${sale.job_id}`)
  return { ok: true }
}

export async function cancelAddonSale(id: string, reason: string): Promise<Result> {
  const ctx = await requirePermission("quotations.edit")
  const why = text(reason, 500)
  if (!why) return fail("A reason is required.")
  const { svc, sale } = await loadSale(id)
  if (!sale) return fail("Line not found.")
  if (["rejected", "cancelled"].includes(sale.status)) return fail("This line is already closed.")
  const isAdmin = ctx.permissions.has("settings.manage") || ctx.permissions.has("payroll.manage")
  if ((sale.status === "approved" || sale.status === "completed") && !isAdmin) {
    return fail("Approved work can only be cancelled by an owner or finance.")
  }

  const now = new Date().toISOString()
  const { data: payout } = await svc.from("addon_commission_payouts").select("id, amount").eq("sale_id", id).is("reversed_at", null).maybeSingle()
  if (payout) {
    await svc
      .from("addon_commission_payouts")
      .update({ reversed_at: now, reversed_by: ctx.userId, reverse_reason: `Sale cancelled: ${why}` })
      .eq("id", payout.id)
  }
  await svc
    .from("addon_sales")
    .update({ status: "cancelled", cancelled_at: now, cancel_reason: why, last_commission_status: "reversed", updated_at: now })
    .eq("id", id)
  await logCurrent("addon.sale.cancel", "addon_sale", id, { name: sale.name, reason: why, reversed_payout: payout?.amount ?? null })
  if (sale.advisor_id && sale.status !== "draft" && sale.status !== "proposed") {
    await notifyUser(sale.advisor_id, {
      title: "Add-on commission reversed",
      body: `${sale.name} was cancelled: ${why}${payout ? `. AED ${Number(payout.amount).toFixed(2)} paid commission will be clawed back.` : ""}`,
      type: "addon",
      link: "/my-addon-sales",
    })
  }
  revalidatePath(`/jobs/${sale.job_id}`)
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}

export async function overrideCommissionRate(id: string, pct: number, reason: string): Promise<Result> {
  await requirePermission("settings.manage")
  const why = text(reason, 500)
  if (!why) return fail("A reason is required for a rate override.")
  const rate = Math.min(100, Math.max(0, num(pct, -1)))
  if (num(pct, -1) < 0) return fail("Enter a rate between 0 and 100.")
  const { svc, sale } = await loadSale(id)
  if (!sale) return fail("Line not found.")
  const { count } = await svc.from("addon_commission_payouts").select("id", { count: "exact", head: true }).eq("sale_id", id).is("reversed_at", null)
  if (count) return fail("Commission is already paid. Reverse the payout before changing the rate.")
  await svc.from("addon_sales").update({ commission_pct: rate, rate_override_reason: why, updated_at: new Date().toISOString() }).eq("id", id)
  await logCurrent("addon.commission.override", "addon_sale", id, { from: sale.commission_pct, to: rate, reason: why })
  await notifyOwners({
    title: "Add-on commission rate overridden",
    body: `${sale.name}: ${sale.commission_pct}% → ${rate}%. Reason: ${why}`,
    type: "addon",
    link: "/reports/addon-sales",
  })
  revalidatePath("/reports/addon-sales")
  revalidatePath(`/jobs/${sale.job_id}`)
  return { ok: true }
}

/* ---------------- Payouts (finance) ---------------- */

export async function recordCommissionPayout(saleId: string, input: { method: string; reference: string; note: string }): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  const { sale } = await loadSale(saleId)
  if (!sale) return fail("Line not found.")
  await syncAddonSales([sale.job_id])
  const [row] = await loadLedger({ jobId: sale.job_id }).then((rows) => rows.filter((r) => r.id === saleId))
  if (!row || !canPayout(row.commission)) {
    return fail("Only fully earned commission on completed, fully paid work can be paid out.")
  }
  if (!row.advisor_id) return fail("This sale has no advisor to pay.")
  const svc = createServiceClient()
  const { error } = await svc.from("addon_commission_payouts").insert({
    sale_id: saleId,
    advisor_id: row.advisor_id,
    amount: row.commission.earned,
    method: text(input.method, 40) || null,
    reference: text(input.reference, 120) || null,
    note: text(input.note, 500) || null,
    created_by: ctx.userId,
  })
  if (error) return fail(error.code === "23505" ? "This commission has already been paid." : error.message)
  await svc.from("addon_sales").update({ last_commission_status: "paid" }).eq("id", saleId)
  await logCurrent("addon.commission.payout", "addon_sale", saleId, { amount: row.commission.earned, advisor: row.advisor_id })
  await notifyUser(row.advisor_id, {
    title: "Add-on commission paid",
    body: `AED ${row.commission.earned.toFixed(2)} for ${row.name} (job ${row.job_number ?? ""}).`,
    type: "addon",
    link: "/my-addon-sales",
  })
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}

export async function reverseCommissionPayout(payoutId: string, reason: string): Promise<Result> {
  const ctx = await requirePermission("payroll.manage")
  const why = text(reason, 500)
  if (!why) return fail("A reason is required.")
  const svc = createServiceClient()
  const { data: p } = await svc.from("addon_commission_payouts").select("*").eq("id", payoutId).is("reversed_at", null).maybeSingle()
  if (!p) return fail("Payout not found or already reversed.")
  await svc
    .from("addon_commission_payouts")
    .update({ reversed_at: new Date().toISOString(), reversed_by: ctx.userId, reverse_reason: why })
    .eq("id", payoutId)
  await svc.from("addon_sales").update({ last_commission_status: null }).eq("id", p.sale_id)
  await logCurrent("addon.commission.payout_reverse", "addon_sale", p.sale_id, { amount: p.amount, reason: why })
  await notifyUser(p.advisor_id, {
    title: "Add-on commission payout reversed",
    body: `AED ${Number(p.amount).toFixed(2)} payout reversed: ${why}`,
    type: "addon",
    link: "/my-addon-sales",
  })
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}

export async function payAllReadyForAdvisor(advisorId: string, reference: string): Promise<Result & { paid?: number }> {
  await requirePermission("payroll.manage")
  const svc = createServiceClient()
  const { data } = await svc
    .from("addon_sales")
    .select("id, job_id")
    .eq("advisor_id", advisorId)
    .eq("status", "completed")
    .or("last_commission_status.is.null,last_commission_status.neq.paid")
  const sales = data ?? []
  if (!sales.length) return fail("Nothing is ready to pay for this advisor.")
  await syncAddonSales([...new Set(sales.map((s) => s.job_id))])
  const rows = await loadLedger({ advisorId })
  const ready = rows.filter((r) => !r.payout && canPayout(r.commission))
  if (!ready.length) return fail("Nothing is ready to pay for this advisor.")
  let paid = 0
  for (const r of ready) {
    const res = await recordCommissionPayout(r.id, { method: "salary", reference, note: "Bulk payout" })
    if (res.ok) paid += 1
  }
  return { ok: true, paid }
}

/* ---------------- Advisor commission rates (admin) ---------------- */

export async function setAdvisorCommissionRate(advisorId: string, pct: number | null, reason: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const why = text(reason, 500)
  if (!why) return fail("A reason is required to change an advisor's rate.")
  const svc = createServiceClient()
  const { data: before } = await svc.from("addon_advisor_rates").select("commission_pct").eq("advisor_id", advisorId).maybeSingle()
  if (pct === null) {
    await svc.from("addon_advisor_rates").delete().eq("advisor_id", advisorId)
  } else {
    const rate = num(pct, -1)
    if (rate < 0 || rate > 100) return fail("Enter a rate between 0 and 100.")
    const { error } = await svc.from("addon_advisor_rates").upsert(
      { advisor_id: advisorId, commission_pct: rate, reason: why, updated_by: ctx.userId, updated_at: new Date().toISOString() },
      { onConflict: "advisor_id" },
    )
    if (error) return fail(error.message)
  }
  await logCurrent("addon.advisor_rate.set", "profile", advisorId, {
    from: before ? Number(before.commission_pct) : "catalog",
    to: pct === null ? "catalog" : pct,
    reason: why,
  })
  await notifyUser(advisorId, {
    title: "Upsell commission rate updated",
    body: pct === null ? "Your upsell commission now follows the product rate." : `Your upsell commission rate is now ${pct}% on new lines.`,
    type: "addon",
    link: "/my-addon-sales",
  })
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}

/* ---------------- Policy & targets (owner) ---------------- */

export async function saveAddonPolicy(policy: "proportional" | "full_only", discountAlertPct: number): Promise<Result> {
  await requirePermission("settings.manage")
  const svc = createServiceClient()
  const before = await getAddonPolicy(svc)
  const pct = Math.min(100, Math.max(0, num(discountAlertPct, 20)))
  const { error } = await svc
    .from("settings")
    .update({ addon_partial_payment_policy: policy === "full_only" ? "full_only" : "proportional", addon_discount_alert_pct: pct })
    .eq("id", 1)
  if (error) return fail(error.message)
  await logCurrent("addon.policy.update", "settings", "1", { before, after: { policy, discountAlertPct: pct } })
  revalidatePath("/settings/addon-catalog")
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}

export async function setAddonTarget(userId: string, monthlyTarget: number): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()
  const { error } = await svc.from("staff_targets").upsert(
    { user_id: userId, kind: "addon", monthly_target: Math.max(0, num(monthlyTarget)), updated_by: ctx.userId, updated_at: new Date().toISOString() },
    { onConflict: "user_id,kind" },
  )
  if (error) return fail(error.message)
  await logCurrent("addon.target.set", "profile", userId, { monthlyTarget })
  revalidatePath("/reports/addon-sales")
  return { ok: true }
}
