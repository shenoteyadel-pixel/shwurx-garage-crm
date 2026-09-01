import { createClient } from "@supabase/supabase-js"

/**
 * Anonymous, cookie-less Supabase client for public token-based endpoints
 * (customer approval). Only the SECURITY DEFINER RPCs get_approval /
 * submit_approval are reachable with the anon key.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
