import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { requireSession } from "@/lib/rbac/context"

/**
 * Recycle Bin — Owner-only view of soft-deleted (archived) records with the
 * ability to restore them or permanently delete them.
 *
 * Soft delete works by setting `deleted_at` (+ `deleted_by`) on a row instead
 * of removing it. Every normal read filters `deleted_at is null`, so archived
 * rows disappear from the app but remain fully recoverable here.
 */

export type RecycleEntityKey =
  | "suppliers"
  | "inventory_items"
  | "parts_requests"
  | "diagnostic_tests"
  | "vehicle_photos"
  | "inspection_markers"

interface EntityConfig {
  key: RecycleEntityKey
  table: string
  /** Plural label for the group header. */
  label: string
  /** Columns to select for building the row label. */
  columns: string
  /** Build a human-readable label from a row. */
  describe: (row: any) => string
  /** Optional secondary line (context). */
  detail?: (row: any) => string | null
  /** Optional image URL for photo rows. */
  image?: (row: any) => string | null
}

export const RECYCLE_ENTITIES: EntityConfig[] = [
  {
    key: "suppliers",
    table: "suppliers",
    label: "Suppliers",
    columns: "id, name, phone, deleted_at, deleted_by",
    describe: (r) => r.name || "Unnamed supplier",
    detail: (r) => r.phone || null,
  },
  {
    key: "inventory_items",
    table: "inventory_items",
    label: "Inventory items",
    columns: "id, name, sku, deleted_at, deleted_by",
    describe: (r) => r.name || "Unnamed item",
    detail: (r) => (r.sku ? `SKU ${r.sku}` : null),
  },
  {
    key: "parts_requests",
    table: "parts_requests",
    label: "Parts requests",
    columns: "id, part_name, quantity, deleted_at, deleted_by",
    describe: (r) => r.part_name || "Part",
    detail: (r) => (r.quantity ? `Qty ${r.quantity}` : null),
  },
  {
    key: "diagnostic_tests",
    table: "diagnostic_tests",
    label: "Diagnostic tests",
    columns: "id, description, source, deleted_at, deleted_by",
    describe: (r) => r.description || "Test",
    detail: (r) => (r.source ? String(r.source).toUpperCase() : null),
  },
  {
    key: "vehicle_photos",
    table: "vehicle_photos",
    label: "Vehicle photos",
    columns: "id, url, kind, caption, deleted_at, deleted_by",
    describe: (r) => r.caption || (r.kind ? `${r.kind} photo` : "Photo"),
    detail: (r) => r.kind || null,
    image: (r) => r.url || null,
  },
  {
    key: "inspection_markers",
    table: "inspection_markers",
    label: "Inspection markers",
    columns: "id, damage_type, location_label, view, deleted_at, deleted_by",
    describe: (r) => r.damage_type || "Marker",
    detail: (r) => [r.location_label, r.view].filter(Boolean).join(" · ") || null,
  },
]

const ENTITY_MAP: Record<string, EntityConfig> = Object.fromEntries(RECYCLE_ENTITIES.map((e) => [e.key, e]))

export interface ArchivedRow {
  id: string
  label: string
  detail: string | null
  image: string | null
  deletedAt: string | null
  deletedByName: string
}

export interface ArchivedGroup {
  key: RecycleEntityKey
  label: string
  rows: ArchivedRow[]
}

/** Owner-only gate. Throws if the current user is not the Owner. */
async function requireOwner() {
  const ctx = await requireSession()
  if (ctx.role !== "owner") {
    throw new Error("Only the Owner can access the Recycle Bin.")
  }
  return ctx
}

export async function isOwner(): Promise<boolean> {
  try {
    const ctx = await requireSession()
    return ctx.role === "owner"
  } catch {
    return false
  }
}

/** List all archived records across every soft-deletable entity. */
export async function listArchived(): Promise<ArchivedGroup[]> {
  await requireOwner()
  const svc = createServiceClient()

  // Resolve actor names once for the "deleted by" column.
  const groups: ArchivedGroup[] = []
  const actorIds = new Set<string>()

  const rawByEntity: { cfg: EntityConfig; rows: any[] }[] = []
  for (const cfg of RECYCLE_ENTITIES) {
    const { data } = await svc
      .from(cfg.table)
      .select(cfg.columns)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
    const rows = (data ?? []) as any[]
    for (const r of rows) if (r.deleted_by) actorIds.add(r.deleted_by as string)
    rawByEntity.push({ cfg, rows })
  }

  const nameById = new Map<string, string>()
  if (actorIds.size > 0) {
    const { data: profiles } = await svc
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(actorIds))
    for (const p of profiles ?? []) nameById.set(p.id as string, (p.full_name as string) || "Unknown")
  }

  for (const { cfg, rows } of rawByEntity) {
    if (rows.length === 0) continue
    groups.push({
      key: cfg.key,
      label: cfg.label,
      rows: rows.map((r) => ({
        id: r.id as string,
        label: cfg.describe(r),
        detail: cfg.detail ? cfg.detail(r) : null,
        image: cfg.image ? cfg.image(r) : null,
        deletedAt: (r.deleted_at as string) ?? null,
        deletedByName: r.deleted_by ? nameById.get(r.deleted_by as string) ?? "Unknown" : "Unknown",
      })),
    })
  }

  return groups
}

/** Restore a soft-deleted row (clears deleted_at / deleted_by). */
export async function restoreArchived(entity: RecycleEntityKey, id: string): Promise<void> {
  const ctx = await requireOwner()
  const cfg = ENTITY_MAP[entity]
  if (!cfg) throw new Error("Unknown record type")
  const svc = createServiceClient()
  const { error } = await svc.from(cfg.table).update({ deleted_at: null, deleted_by: null }).eq("id", id)
  if (error) throw new Error(error.message)
  await svc.from("audit_logs").insert({
    actor_id: ctx.userId,
    actor_name: ctx.name,
    actor_role: ctx.role,
    action: "recycle_bin.restore",
    resource_type: cfg.key,
    resource_id: id,
    status: "ok",
  })
}

/** Permanently delete a soft-deleted row (irreversible). */
export async function purgeArchived(entity: RecycleEntityKey, id: string): Promise<void> {
  const ctx = await requireOwner()
  const cfg = ENTITY_MAP[entity]
  if (!cfg) throw new Error("Unknown record type")
  const svc = createServiceClient()
  // Guard: only purge rows that are actually archived — never a live record.
  const { data: row } = await svc.from(cfg.table).select("id, deleted_at").eq("id", id).maybeSingle()
  if (!row) throw new Error("Record not found")
  if (!row.deleted_at) throw new Error("Only archived records can be permanently deleted")
  const { error } = await svc.from(cfg.table).delete().eq("id", id)
  if (error) throw new Error(error.message)
  await svc.from("audit_logs").insert({
    actor_id: ctx.userId,
    actor_name: ctx.name,
    actor_role: ctx.role,
    action: "recycle_bin.purge",
    resource_type: cfg.key,
    resource_id: id,
    status: "ok",
  })
}
