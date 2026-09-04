import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Public marketing-site business info.
 *
 * Read with the SERVICE client (anonymous visitors have no session and the
 * settings table is RLS-protected) but expose ONLY non-sensitive, public-facing
 * fields — never the TRN, trade licence, or legal/internal notes.
 */
export type PublicSiteInfo = {
  companyName: string
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
}

const DEFAULTS: PublicSiteInfo = {
  companyName: "SHWURX Garage",
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
}

export async function getPublicSiteInfo(): Promise<PublicSiteInfo> {
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from("settings")
      .select("company_name, phone, email, address")
      .eq("id", 1)
      .maybeSingle()
    if (!data) return DEFAULTS
    return {
      companyName: data.company_name || DEFAULTS.companyName,
      phone: data.phone || null,
      // No dedicated WhatsApp column; use the main phone for the WhatsApp link.
      whatsapp: data.phone || null,
      email: data.email || null,
      address: data.address || null,
    }
  } catch {
    return DEFAULTS
  }
}
