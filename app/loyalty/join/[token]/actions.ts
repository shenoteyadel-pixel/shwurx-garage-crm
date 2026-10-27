"use server"

import { createClient } from "@/lib/supabase/server"

export type EnrollState = { status: "idle" | "enrolled" | "already_active" | "mismatch" | "locked" | "invalid" | "error"; message?: string }

export async function enrollAction(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const token = String(formData.get("token") ?? "")
  const last4 = String(formData.get("last4") ?? "").replace(/\D/g, "")
  const optIn = formData.get("whatsapp") === "on"
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: "invalid" }
  if (last4.length !== 4) return { status: "mismatch", message: "Enter the last 4 digits of your mobile number." }
  if (formData.get("terms") !== "on") return { status: "error", message: "Please accept the programme terms to join." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_enroll", {
    p_token: token,
    p_mobile_last4: last4,
    p_whatsapp_opt_in: optIn,
  })
  if (error) return { status: "error", message: "Something went wrong. Please try again or ask our service desk." }
  const result = String(data)
  if (result === "enrolled" || result === "already_active" || result === "locked" || result === "invalid") {
    return { status: result }
  }
  if (result === "mismatch") return { status: "mismatch", message: "Those digits don't match the mobile number on file." }
  return { status: "invalid" }
}
