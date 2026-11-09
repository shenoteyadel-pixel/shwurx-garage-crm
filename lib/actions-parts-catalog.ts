"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { notifyByPermission, notifyUser } from "@/lib/actions-notifications"
import {
  catalogSpecLabel,
  normalizeCatalogSpec,
  validateCatalogSpec,
  validateSellingPrice,
} from "@/lib/parts-catalog"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const ITEM_COLUMNS =
  "id, item_type, name, brand, manufacturer, part_number, quality, condition, specification, product_line, viscosity, approvals, package_size, unit, used_item_ref, warranty_months, created_at, retired_at, oem_part_number, our_part_number, inventory_item_id"

export type CatalogRevision = {
  id: string
  catalog_id: string
  selling_price: number
  effective_from: string
  status: "pending" | "approved" | "rejected"
  reason: string
  requested_by: string | null
  requested_by_name: string | null
  requested_at: string
  decided_by_name: string | null
  decided_at: string | null
  decision_note: string | null
}

export type CatalogEntry = {
  id: string
  item_type: string
  name: string
  brand: string | null
  manufacturer: string | null
  part_number: string | null
  quality: string
  condition: string | null
  specification: string | null
  product_line: string | null
  viscosity: string | null
  approvals: string | null
  package_size: string | null
  unit: string
  used_item_ref: string | null
  warranty_months: number | null
  created_at: string
  retired_at: string | null
  oem_part_number: string | null
  our_part_number: string | null
  inventory_item_id: string | null
  label: string
  current: { revision_id: string; selling_price: number } | null
  pending: CatalogRevision | null
  revisions: CatalogRevision[]
}

function currentRevision(revisions: CatalogRevision[]): CatalogRevision | null {
  const now = Date.now()
  return (
    revisions
      .filter((r) => r.status === "approved" && new Date(r.effective_from).getTime() <= now)
      .sort(
        (a, b) =>
          new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime() ||
          new Date(b.decided_at ?? 0).getTime() - new Date(a.decided_at ?? 0).getTime(),
      )[0] ?? null
  )
}

export async function listCatalog(): Promise<CatalogEntry[]> {
  await requirePermission("quotations.view")
  const svc = createServiceClient()
  const { data: items, error } = await svc
    .from("parts_price_catalog")
    .select(ITEM_COLUMNS)
    .order("name", { ascending: true })
    .limit(1000)
  if (error) throw new Error(error.message)
  const ids = (items ?? []).map((i) => i.id as string)
  const { data: revs } = ids.length
    ? await svc
        .from("parts_price_revisions")
        .select(
          "id, catalog_id, selling_price, effective_from, status, reason, requested_by, requested_by_name, requested_at, decided_by_name, decided_at, decision_note",
        )
        .in("catalog_id", ids)
        .order("requested_at", { ascending: false })
    : { data: [] }

  const byItem = new Map<string, CatalogRevision[]>()
  for (const r of (revs ?? []) as CatalogRevision[]) {
    const list = byItem.get(r.catalog_id) ?? []
    list.push({ ...r, selling_price: Number(r.selling_price) })
    byItem.set(r.catalog_id, list)
  }

  return (items ?? []).map((item) => {
    const revisions = byItem.get(item.id as string) ?? []
    const current = currentRevision(revisions)
    return {
      ...(item as Omit<CatalogEntry, "label" | "current" | "pending" | "revisions">),
      label: catalogSpecLabel(item as unknown as Record<string, never>),
      current: current ? { revision_id: current.id, selling_price: current.selling_price } : null,
      pending: revisions.find((r) => r.status === "pending") ?? null,
      revisions,
    }
  })
}

export type QuoteCatalogOption = {
  catalog_id: string
  revision_id: string
  name: string
  part_number: string | null
  label: string
  selling_price: number
}

/** Active catalog items with an approved current price, for the quotation editor. */
export async function searchCatalogForQuote(query: string): Promise<QuoteCatalogOption[]> {
  await requirePermission("quotations.create")
  const svc = createServiceClient()
  const term = query.trim().replace(/[%_,()]/g, " ").slice(0, 60)
  let request = svc.from("parts_price_catalog").select(ITEM_COLUMNS).is("retired_at", null).limit(25)
  if (term) {
    request = request.or(
      `name.ilike.%${term}%,part_number.ilike.%${term}%,oem_part_number.ilike.%${term}%,our_part_number.ilike.%${term}%,manufacturer.ilike.%${term}%,brand.ilike.%${term}%,specification.ilike.%${term}%`,
    )
  }
  const { data: items } = await request.order("name")
  const ids = (items ?? []).map((i) => i.id as string)
  if (!ids.length) return []
  const { data: prices } = await svc
    .from("parts_price_current")
    .select("catalog_id, revision_id, selling_price")
    .in("catalog_id", ids)
  const priceByItem = new Map((prices ?? []).map((p) => [p.catalog_id as string, p]))

  return (items ?? []).flatMap((item) => {
    const price = priceByItem.get(item.id as string)
    if (!price) return []
    return [
      {
        catalog_id: item.id as string,
        revision_id: price.revision_id as string,
        name: item.name as string,
        part_number: (item.part_number as string | null) ?? null,
        label: catalogSpecLabel(item as unknown as Record<string, never>),
        selling_price: Number(price.selling_price),
      },
    ]
  })
}

export async function createCatalogItem(input: {
  spec: Record<string, unknown>
  sellingPrice: number
  reason: string
}): Promise<Result<{ id: string }>> {
  const ctx = await requirePermission("quotations.edit")
  const spec = normalizeCatalogSpec(input.spec)
  const specError = validateCatalogSpec(spec)
  if (specError) return { ok: false, error: specError }
  const priceError = validateSellingPrice(input.sellingPrice)
  if (priceError) return { ok: false, error: priceError }
  const reason = input.reason.trim() || "Initial catalog price"

  const svc = createServiceClient()
  const { data: item, error } = await svc
    .from("parts_price_catalog")
    .insert({ ...spec, created_by: ctx.userId })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This exact item is already in the catalog. Request a price change on it instead." }
    }
    return { ok: false, error: error.message }
  }

  const { error: revError } = await svc.from("parts_price_revisions").insert({
    catalog_id: item.id,
    selling_price: Number(input.sellingPrice),
    reason,
    requested_by: ctx.userId,
    requested_by_name: ctx.name ?? null,
  })
  if (revError) return { ok: false, error: revError.message }

  await logAction(ctx, "parts_catalog.create", "parts_price_catalog", item.id, {
    name: spec.name,
    selling_price: Number(input.sellingPrice),
  })
  await notifyByPermission("settings.manage", {
    title: "New catalog price to approve",
    body: `${spec.name}: ${Number(input.sellingPrice).toFixed(2)} AED requested by ${ctx.name ?? "staff"}.`,
    type: "approval",
    link: "/pricing",
  })
  revalidatePath("/pricing")
  return { ok: true, id: item.id as string }
}

export async function requestPriceRevision(input: {
  catalogId: string
  sellingPrice: number
  reason: string
}): Promise<Result> {
  const ctx = await requirePermission("quotations.edit")
  const priceError = validateSellingPrice(input.sellingPrice)
  if (priceError) return { ok: false, error: priceError }
  if (input.reason.trim().length < 3) return { ok: false, error: "Give a reason for the price change." }

  const svc = createServiceClient()
  const { data: item } = await svc
    .from("parts_price_catalog")
    .select("id, name, retired_at")
    .eq("id", input.catalogId)
    .maybeSingle()
  if (!item) return { ok: false, error: "Catalog item not found." }
  if (item.retired_at) return { ok: false, error: "This item is retired." }

  const { count } = await svc
    .from("parts_price_revisions")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", input.catalogId)
    .eq("status", "pending")
  if ((count ?? 0) > 0) return { ok: false, error: "A price change for this item is already waiting for approval." }

  const { data: rev, error } = await svc
    .from("parts_price_revisions")
    .insert({
      catalog_id: input.catalogId,
      selling_price: Number(input.sellingPrice),
      reason: input.reason.trim(),
      requested_by: ctx.userId,
      requested_by_name: ctx.name ?? null,
    })
    .select("id")
    .single()
  if (error) return { ok: false, error: error.message }

  await logAction(ctx, "parts_catalog.request_price", "parts_price_revisions", rev.id, {
    catalog_id: input.catalogId,
    selling_price: Number(input.sellingPrice),
  })
  await notifyByPermission("settings.manage", {
    title: "Price change to approve",
    body: `${item.name}: ${Number(input.sellingPrice).toFixed(2)} AED requested by ${ctx.name ?? "staff"}.`,
    type: "approval",
    link: "/pricing",
  })
  revalidatePath("/pricing")
  return { ok: true }
}

export async function decidePriceRevision(input: {
  revisionId: string
  approve: boolean
  note?: string
}): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()
  const { data: rev } = await svc
    .from("parts_price_revisions")
    .select("id, catalog_id, status, selling_price, requested_by, requested_at, parts_price_catalog(name)")
    .eq("id", input.revisionId)
    .maybeSingle()
  if (!rev) return { ok: false, error: "Price revision not found." }
  if (rev.status !== "pending") return { ok: false, error: "This price change has already been decided." }

  if (input.approve) {
    const { count } = await svc
      .from("parts_price_revisions")
      .select("id", { count: "exact", head: true })
      .eq("catalog_id", rev.catalog_id)
      .eq("status", "approved")
      .gt("effective_from", rev.requested_at)
    if ((count ?? 0) > 0) {
      return { ok: false, error: "A newer price is already approved for this item. Reject this older request." }
    }
  }

  const { error } = await svc
    .from("parts_price_revisions")
    .update({
      status: input.approve ? "approved" : "rejected",
      decided_by: ctx.userId,
      decided_by_name: ctx.name ?? null,
      decided_at: new Date().toISOString(),
      decision_note: input.note?.trim() || null,
    })
    .eq("id", rev.id)
    .eq("status", "pending")
  if (error) return { ok: false, error: error.message }

  const name = (rev.parts_price_catalog as { name?: string } | null)?.name ?? "Catalog item"
  await logAction(ctx, input.approve ? "parts_catalog.approve_price" : "parts_catalog.reject_price", "parts_price_revisions", rev.id, {
    catalog_id: rev.catalog_id,
    selling_price: Number(rev.selling_price),
  })
  if (rev.requested_by && rev.requested_by !== ctx.userId) {
    await notifyUser(rev.requested_by as string, {
      title: input.approve ? "Price approved" : "Price change rejected",
      body: `${name}: ${Number(rev.selling_price).toFixed(2)} AED${input.note?.trim() ? `. ${input.note.trim()}` : ""}`,
      type: "approval",
      link: "/pricing",
    })
  }
  revalidatePath("/pricing")
  return { ok: true }
}

function cleanText(value: unknown): string | null {
  const text = value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, " ")
  return text ? text.slice(0, 200) : null
}

function identityPart(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[\s\-.]/g, "")
}

/** Inventory parts that have a selling price but no price catalog entry yet. */
export async function countInventoryMissingFromCatalog(): Promise<number> {
  await requirePermission("quotations.view")
  const svc = createServiceClient()
  const [{ data: inv }, { data: linked }] = await Promise.all([
    svc.from("inventory_items").select("id").is("deleted_at", null).gt("sale_price", 0).limit(5000),
    svc.from("parts_price_catalog").select("inventory_item_id").not("inventory_item_id", "is", null).limit(5000),
  ])
  const linkedIds = new Set((linked ?? []).map((l) => l.inventory_item_id as string))
  return (inv ?? []).filter((i) => !linkedIds.has(i.id as string)).length
}

/**
 * Adds every inventory part that is not in the catalog yet, keeping its OEM number,
 * our part number (CRM ID) and its current inventory selling price as the approved price.
 * Existing catalog items and prices are never changed.
 */
export async function syncCatalogFromInventory(): Promise<Result<{ added: number; skipped: number }>> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()

  const [{ data: inv, error: invError }, { data: existing }] = await Promise.all([
    svc
      .from("inventory_items")
      .select("id, name, brand, sku, oem_part_number, supplier_part_number, crm_part_id, unit, sale_price")
      .is("deleted_at", null)
      .gt("sale_price", 0)
      .order("name")
      .limit(5000),
    svc.from("parts_price_catalog").select("inventory_item_id, identity_key").limit(5000),
  ])
  if (invError) return { ok: false, error: invError.message }

  const linkedIds = new Set((existing ?? []).map((e) => e.inventory_item_id as string | null).filter(Boolean))
  const usedKeys = new Set((existing ?? []).map((e) => e.identity_key as string))
  const now = new Date().toISOString()
  let added = 0
  let skipped = 0

  const baseKeys = new Set([...usedKeys].map((k) => k.split("|").slice(0, 12).join("|")))
  const rows: Record<string, unknown>[] = []
  const priceByInventory = new Map<string, number>()

  for (const item of inv ?? []) {
    if (linkedIds.has(item.id as string)) continue
    const name = cleanText(item.name)
    if (!name) {
      skipped++
      continue
    }
    const oem = cleanText(item.oem_part_number)
    const ours = cleanText(item.crm_part_id)
    const partNumber = oem ?? cleanText(item.sku) ?? cleanText(item.supplier_part_number) ?? ours
    const quality = oem ? "oem_oes" : "aftermarket"
    const unit = cleanText(item.unit)?.toLowerCase() ?? "each"
    const brand = cleanText(item.brand)
    // Mirrors the first 12 fields of the database identity_key (up to and including unit).
    const baseKey = ["part", (brand ?? "").toLowerCase(), "", identityPart(partNumber), quality, "", "", "", "", "", "", unit].join("|")
    // Two inventory rows can share a part number; tag the duplicate with our part number so each stays separate.
    const usedItemRef = baseKeys.has(baseKey) ? (ours ?? (item.id as string)) : null
    baseKeys.add(baseKey)

    rows.push({
      item_type: "part",
      name,
      brand,
      part_number: partNumber,
      quality,
      unit,
      used_item_ref: usedItemRef,
      oem_part_number: oem,
      our_part_number: ours,
      inventory_item_id: item.id,
      created_by: ctx.userId,
    })
    priceByInventory.set(item.id as string, Math.round(Number(item.sale_price) * 100) / 100)
  }

  const insertRows = async (batch: Record<string, unknown>[]) => {
    const { data, error } = await svc.from("parts_price_catalog").insert(batch).select("id, inventory_item_id")
    if (!error) return data ?? []
    if (batch.length === 1) {
      skipped++
      return []
    }
    const created: { id: string; inventory_item_id: string }[] = []
    for (const row of batch) created.push(...((await insertRows([row])) as typeof created))
    return created
  }

  for (let i = 0; i < rows.length; i += 100) {
    const created = (await insertRows(rows.slice(i, i + 100))) as { id: string; inventory_item_id: string }[]
    if (!created.length) continue
    const revisions = created.map((c) => ({
      catalog_id: c.id,
      selling_price: priceByInventory.get(c.inventory_item_id) ?? 0,
      reason: "Imported from inventory selling price",
      status: "approved",
      effective_from: now,
      requested_by: ctx.userId,
      requested_by_name: ctx.name ?? null,
      decided_by: ctx.userId,
      decided_by_name: ctx.name ?? null,
      decided_at: now,
    }))
    const { error: revError } = await svc.from("parts_price_revisions").insert(revisions)
    if (revError) return { ok: false, error: `Parts were added but prices failed: ${revError.message}` }
    added += created.length
  }

  await logAction(ctx, "parts_catalog.sync_inventory", "parts_price_catalog", null, { added, skipped })
  revalidatePath("/pricing")
  return { ok: true, added, skipped }
}

export async function retireCatalogItem(catalogId: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()
  const { error } = await svc
    .from("parts_price_catalog")
    .update({ retired_at: new Date().toISOString(), retired_by: ctx.userId })
    .eq("id", catalogId)
    .is("retired_at", null)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "parts_catalog.retire", "parts_price_catalog", catalogId, {})
  revalidatePath("/pricing")
  return { ok: true }
}
