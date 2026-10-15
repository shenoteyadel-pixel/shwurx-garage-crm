"use server"

import { revalidatePath } from "next/cache"
import { requireSession, ctxCan, ForbiddenError } from "@/lib/rbac/context"
import { importAllMetaLeads } from "@/lib/meta-leads"

export type MetaImportState =
  | { ok: true; pageName: string | null; forms: number; found: number; created: number; errors: number }
  | { ok: false; error: string }

export async function importMetaLeads(): Promise<MetaImportState> {
  const ctx = await requireSession()
  if (!ctxCan(ctx, "leads.manage")) throw new ForbiddenError("leads.manage")

  const token = process.env.META_PAGE_ACCESS_TOKEN
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN is not set on this deployment." }

  try {
    const r = await importAllMetaLeads(token)
    if (r.created > 0) revalidatePath("/leads")
    if (r.errors.length) console.error("Meta lead import errors:", r.errors.slice(0, 5))
    return { ok: true, pageName: r.pageName, forms: r.forms, found: r.found, created: r.created, errors: r.errors.length }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
