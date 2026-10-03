"use server"

import { revalidatePath } from "next/cache"
import { getShellUser } from "@/lib/shell-user"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export type TargetKind = "purchase" | "sales" | "technician"
const KINDS: TargetKind[] = ["purchase", "sales", "technician"]

export async function saveStaffTarget(userId: string, kind: TargetKind, amount: number) {
  const user = await getShellUser()
  if (user.role !== "owner") return { ok: false as const, error: "Only the owner can set targets." }
  if (!KINDS.includes(kind)) return { ok: false as const, error: "Invalid target type." }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false as const, error: "Invalid staff member." }
  const value = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    return { ok: false as const, error: "Enter a target between 0 and 100,000,000." }
  }

  const { data: auth } = await (await createClient()).auth.getUser()
  const { error } = await createServiceClient()
    .from("staff_targets")
    .upsert(
      { user_id: userId, kind, monthly_target: value, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,kind" },
    )
  if (error) return { ok: false as const, error: error.message }

  revalidatePath("/reports/staff-targets")
  return { ok: true as const }
}
