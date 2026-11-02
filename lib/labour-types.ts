import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

export type LabourRateType = "hourly" | "fixed"

export type LabourType = {
  id: string
  name: string
  category: string | null
  rate_type: LabourRateType
  rate: number
  default_hours: number
  description: string | null
  active: boolean
  sort_order: number
  updated_at: string
}

export const LABOUR_COLUMNS = "id, name, category, rate_type, rate, default_hours, description, active, sort_order, updated_at"

export function toLabourType(row: Record<string, unknown>): LabourType {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    category: (row.category as string | null) ?? null,
    rate_type: row.rate_type === "fixed" ? "fixed" : "hourly",
    rate: Number(row.rate) || 0,
    default_hours: Number(row.default_hours) || 0,
    description: (row.description as string | null) ?? null,
    active: Boolean(row.active),
    sort_order: Number(row.sort_order) || 0,
    updated_at: String(row.updated_at ?? ""),
  }
}

/** Active labour types for the quotation builder. Never throws — falls back to an empty list. */
export async function getActiveLabourTypes(): Promise<LabourType[]> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("labour_types")
    .select(LABOUR_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error || !data) return []
  return data.map((r) => toLabourType(r as Record<string, unknown>))
}
