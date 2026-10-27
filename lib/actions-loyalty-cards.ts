"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { logCurrent } from "@/lib/rbac/context"
import { getShellUser } from "@/lib/shell-user"
import { createClient, createServiceClient } from "@/lib/supabase/server"

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

const UUID = /^[0-9a-f-]{36}$/i
const TIERS = ["member", "silver", "vip"] as const
const STATUSES = ["invited", "active", "suspended", "closed"] as const

async function ownerGuard(): Promise<string | null> {
  const user = await getShellUser()
  return user.role === "owner" ? null : "Only the owner can manage loyalty cards."
}

function friendly(message: string | undefined) {
  if (!message) return "Something went wrong. Please try again."
  if (message.includes("insufficient") || message.includes("balance")) return "The customer does not have enough points for this deduction."
  return message.replace(/^.*?exception:?\s*/i, "")
}

function refresh(id?: string) {
  revalidatePath("/loyalty/cards")
  if (id) revalidatePath(`/loyalty/cards/${id}`)
}

export async function setCardTier(membershipId: string, tier: string | null): Promise<Result<string>> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(membershipId)) return { ok: false, error: "Invalid card." }
  if (tier !== null && !TIERS.includes(tier as (typeof TIERS)[number])) return { ok: false, error: "Invalid tier." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_owner_set_tier", { p_membership: membershipId, p_tier: tier })
  if (error) return { ok: false, error: friendly(error.message) }
  await logCurrent("loyalty_tier_set", "loyalty_membership", membershipId, { tier_override: tier ?? "automatic", tier: data })
  refresh(membershipId)
  return { ok: true, data: String(data) }
}

export async function setCardStatus(membershipId: string, status: string): Promise<Result<number>> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(membershipId)) return { ok: false, error: "Invalid card." }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { ok: false, error: "Invalid status." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_owner_set_status", { p_membership: membershipId, p_status: status })
  if (error) return { ok: false, error: friendly(error.message) }
  await logCurrent("loyalty_status_set", "loyalty_membership", membershipId, { status, retro_points: data })
  refresh(membershipId)
  return { ok: true, data: Number(data) || 0 }
}

export async function adjustCardPoints(
  membershipId: string,
  points: number,
  reason: string,
  requestKey: string,
): Promise<Result> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(membershipId)) return { ok: false, error: "Invalid card." }
  const value = Math.trunc(Number(points))
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) > 1_000_000) {
    return { ok: false, error: "Enter a whole number of points (not zero)." }
  }
  const cleanReason = String(reason ?? "").trim().slice(0, 300)
  if (cleanReason.length < 5) return { ok: false, error: "Please write a reason (at least 5 characters)." }
  const key = /^[0-9a-f-]{36}$/i.test(requestKey) ? requestKey : randomUUID()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_owner_adjust", {
    p_membership: membershipId,
    p_points: value,
    p_reason: cleanReason,
    p_idempotency_key: `owner:${key}`,
  })
  if (error) return { ok: false, error: friendly(error.message) }
  await logCurrent("loyalty_points_adjusted", "loyalty_membership", membershipId, {
    points: value,
    reason: cleanReason,
    adjustment_id: data,
  })
  refresh(membershipId)
  return { ok: true, data: null }
}

export async function saveCardNote(membershipId: string, note: string): Promise<Result> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(membershipId)) return { ok: false, error: "Invalid card." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("loyalty_owner_set_note", {
    p_membership: membershipId,
    p_note: String(note ?? "").slice(0, 500),
  })
  if (error) return { ok: false, error: friendly(error.message) }
  await logCurrent("loyalty_note_saved", "loyalty_membership", membershipId)
  refresh(membershipId)
  return { ok: true, data: null }
}

export async function unlockCard(membershipId: string): Promise<Result> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(membershipId)) return { ok: false, error: "Invalid card." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("loyalty_owner_unlock", { p_membership: membershipId })
  if (error) return { ok: false, error: friendly(error.message) }
  await logCurrent("loyalty_card_unlocked", "loyalty_membership", membershipId)
  refresh(membershipId)
  return { ok: true, data: null }
}

export type CustomerMatch = { id: string; name: string; mobile: string | null; hasCard: boolean }

export async function searchCustomersForCard(query: string): Promise<Result<CustomerMatch[]>> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  const q = String(query ?? "").trim().replace(/[%,()*]/g, "").slice(0, 60)
  if (q.length < 2) return { ok: true, data: [] }
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("customers")
    .select("id, full_name, mobile, loyalty_memberships(id)")
    .or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`)
    .order("full_name")
    .limit(10)
  if (error) return { ok: false, error: "Search failed." }
  return {
    ok: true,
    data: (data ?? []).map((c) => {
      const m = c.loyalty_memberships as unknown
      return {
        id: c.id as string,
        name: (c.full_name as string) ?? "Customer",
        mobile: (c.mobile as string | null) ?? null,
        hasCard: Array.isArray(m) ? m.length > 0 : !!m,
      }
    }),
  }
}

export async function createCardForCustomer(customerId: string): Promise<Result<string>> {
  const denied = await ownerGuard()
  if (denied) return { ok: false, error: denied }
  if (!UUID.test(customerId)) return { ok: false, error: "Invalid customer." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("loyalty_invite", { p_customer: customerId })
  if (error) return { ok: false, error: friendly(error.message) }
  const svc = createServiceClient()
  const { data } = await svc.from("loyalty_memberships").select("id").eq("customer_id", customerId).maybeSingle()
  if (!data) return { ok: false, error: "Could not create the card." }
  await logCurrent("loyalty_card_created", "loyalty_membership", data.id, { customer_id: customerId })
  refresh()
  return { ok: true, data: data.id as string }
}
