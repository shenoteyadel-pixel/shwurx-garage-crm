"use server"

import { getSessionContext } from "@/lib/rbac/context"
import { createServiceClient } from "@/lib/supabase/server"
import { GUIDE_VERSION } from "@/lib/i18n/crm"

export async function markGuideSeen(): Promise<{ ok: boolean }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false }
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ guide_seen_version: GUIDE_VERSION })
    .eq("id", ctx.userId)
  return { ok: !error }
}
