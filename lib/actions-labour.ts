"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { LABOUR_COLUMNS, toLabourType, type LabourType } from "@/lib/labour-types"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export type LabourInput = {
  name: string
  category: string
  rate_type: "hourly" | "fixed"
  rate: number
  default_hours: number
  description: string
  sort_order: number
}

function clean(input: LabourInput): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim()
  if (!name) return { ok: false, error: "Labour name is required." }
  if (name.length > 80) return { ok: false, error: "Labour name is too long (max 80 characters)." }
  const rateType = input.rate_type === "fixed" ? "fixed" : "hourly"
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100000) return { ok: false, error: "Rate must be between 0 and 100,000 AED." }
  const hours = rateType === "fixed" ? 1 : Number(input.default_hours)
  if (!Number.isFinite(hours) || hours < 0 || hours > 999) return { ok: false, error: "Default hours must be between 0 and 999." }
  const sort = Math.trunc(Number(input.sort_order) || 0)
  return {
    ok: true,
    row: {
      name,
      category: String(input.category ?? "").trim().slice(0, 60) || null,
      rate_type: rateType,
      rate: Math.round(rate * 100) / 100,
      default_hours: Math.round(hours * 100) / 100,
      description: String(input.description ?? "").trim().slice(0, 1000) || null,
      sort_order: sort,
    },
  }
}

function friendly(message: string) {
  return message.includes("labour_types_name_uq") ? "A labour type with this name already exists." : message
}

function refresh() {
  revalidatePath("/labour")
  revalidatePath("/jobs/[id]", "page")
}

export async function listLabourTypes(): Promise<LabourType[]> {
  await requirePermission("quotations.view")
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("labour_types")
    .select(LABOUR_COLUMNS)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => toLabourType(r as Record<string, unknown>))
}

export async function createLabourType(input: LabourInput): Promise<Result<{ id: string }>> {
  const ctx = await requirePermission("settings.manage")
  const parsed = clean(input)
  if (!parsed.ok) return parsed
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("labour_types")
    .insert({ ...parsed.row, created_by: ctx.userId })
    .select("id")
    .single()
  if (error) return { ok: false, error: friendly(error.message) }
  await logAction(ctx, "labour_type.create", "labour_types", data.id, parsed.row)
  refresh()
  return { ok: true, id: data.id }
}

export async function updateLabourType(id: string, input: LabourInput): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const parsed = clean(input)
  if (!parsed.ok) return parsed
  const svc = createServiceClient()
  const { error } = await svc
    .from("labour_types")
    .update({ ...parsed.row, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: friendly(error.message) }
  await logAction(ctx, "labour_type.update", "labour_types", id, parsed.row)
  refresh()
  return { ok: true }
}

export async function setLabourTypeActive(id: string, active: boolean): Promise<Result> {
  const ctx = await requirePermission("settings.manage")
  const svc = createServiceClient()
  const { error } = await svc
    .from("labour_types")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, active ? "labour_type.enable" : "labour_type.disable", "labour_types", id, {})
  refresh()
  return { ok: true }
}
