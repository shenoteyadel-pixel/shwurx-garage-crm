export const WA_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "inspection_booked", label: "Inspection booked" },
  { value: "quotation_sent", label: "Quotation sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const

export type WaStatus = (typeof WA_STATUSES)[number]["value"]

export const WA_SOURCES: Record<string, string> = {
  facebook_ad: "Facebook ad",
  instagram_ad: "Instagram ad",
  direct: "Direct",
  other: "Other",
}

export const WINDOW_MS = 24 * 60 * 60 * 1000

export function windowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS
}

export function statusLabel(v: string): string {
  return WA_STATUSES.find((s) => s.value === v)?.label ?? v
}

export interface WaConversationRow {
  id: string
  wa_phone: string
  wa_name: string | null
  customer_id: string | null
  customer_name: string | null
  assigned_to: string | null
  assigned_name: string | null
  status: WaStatus
  lead_source: string
  follow_up_at: string | null
  last_inbound_at: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
}

export interface WaMessageRow {
  id: string
  direction: "in" | "out"
  type: string
  body: string | null
  media_blob_path: string | null
  media_mime: string | null
  media_filename: string | null
  status: string
  error: string | null
  sent_by_name: string | null
  created_at: string
  wa_timestamp: string | null
}
