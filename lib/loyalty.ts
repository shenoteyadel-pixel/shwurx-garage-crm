import QRCode from "qrcode"
import type { SupabaseClient } from "@supabase/supabase-js"

export type LoyaltyInvoiceSummary = {
  program_enabled: boolean
  membership_status: "invited" | "active" | "suspended" | "closed" | null
  membership_number: string | null
  tier: "member" | "silver" | "vip" | null
  points_earned: number
  points_available: number | null
  redeemed_points: number
  redeemed_value_aed: number
  enroll_token: string | null
}

export const TIER_LABEL: Record<string, string> = { member: "Member", silver: "Silver", vip: "VIP" }

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://swurxauto.com").replace(/\/$/, "")

export function loyaltyJoinUrl(token: string) {
  return `${SITE_URL}/loyalty/join/${encodeURIComponent(token)}`
}

export function loyaltyQrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 96 })
}

/** Returns null when the loyalty migration is not applied or the viewer lacks access, so documents still render. */
export async function getLoyaltyInvoiceSummary(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<LoyaltyInvoiceSummary | null> {
  const { data, error } = await supabase.rpc("loyalty_invoice_summary", { p_invoice: invoiceId })
  if (error || !data) return null
  const row = (Array.isArray(data) ? data[0] : data) as LoyaltyInvoiceSummary | undefined
  return row ?? null
}
