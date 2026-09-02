import { createClient } from "@/lib/supabase/server"

export type Settings = {
  id: number
  company_name: string
  legal_name: string | null
  trn: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  footer_note: string | null
  labour_rate_default: number
  quotation_validity_days: number
}

const DEFAULTS: Settings = {
  id: 1,
  company_name: "SHWURX Garage",
  legal_name: null,
  trn: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  logo_url: null,
  footer_note: null,
  labour_rate_default: 0,
  quotation_validity_days: 14,
}

// Fetch the singleton company settings row (id=1). Falls back to sane defaults
// so print documents and headers always render, even before setup.
export async function getSettings(): Promise<Settings> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle()
    if (!data) return DEFAULTS
    return { ...DEFAULTS, ...data }
  } catch {
    return DEFAULTS
  }
}
