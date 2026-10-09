import type { SupabaseClient } from "@supabase/supabase-js"
import type { LeadRow } from "@/lib/actions-leads"

export type StaffOption = { id: string; name: string }

/**
 * "error" means the lead query itself failed and must never be shown as an empty inbox.
 * A staff-list failure only disables assignment; it never hides lead rows.
 */
export type LeadsPageData =
  | { state: "error" }
  | { state: "empty" | "list"; leads: LeadRow[]; staff: StaffOption[]; staffUnavailable: boolean }

type ReadClient = Pick<SupabaseClient, "from">

export async function loadLeadsPageData(supabase: ReadClient): Promise<LeadsPageData> {
  const [leadResult, staffResult] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, name, phone, email, message, service_interest, source, status, customer_id, metadata, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("is_active", true)
      .neq("role", "customer")
      .order("full_name"),
  ])

  // Only the error code is logged: never row data, messages or query text.
  if (leadResult.error) {
    console.error("[leads] lead query failed", leadResult.error.code ?? "unknown")
    return { state: "error" }
  }
  if (staffResult.error) console.error("[leads] staff query failed", staffResult.error.code ?? "unknown")

  const leads = (leadResult.data ?? []) as LeadRow[]
  const staffUnavailable = !!staffResult.error
  const staff = staffUnavailable
    ? []
    : (staffResult.data ?? []).map((s) => ({
        id: s.id as string,
        name: (s.full_name as string) || (s.email as string) || "Staff",
      }))

  return { state: leads.length ? "list" : "empty", leads, staff, staffUnavailable }
}
