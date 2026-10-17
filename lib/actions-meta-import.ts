"use server"

import { revalidatePath } from "next/cache"
import { requireSession, ctxCan, ForbiddenError } from "@/lib/rbac/context"
import { explainMetaError, importAllMetaLeads } from "@/lib/meta-leads"
import { getMetaToken, upgradeAndStoreMetaToken } from "@/lib/meta-token"

export type MetaImportState =
  | { ok: true; pageName: string | null; forms: number; found: number; created: number; errors: number }
  | { ok: false; error: string }

export async function importMetaLeads(): Promise<MetaImportState> {
  const ctx = await requireSession()
  if (!ctxCan(ctx, "leads.manage")) throw new ForbiddenError("leads.manage")

  const token = await getMetaToken()
  if (!token) return { ok: false, error: "Meta is not connected yet. Paste a token in Reconnect Meta." }

  try {
    const r = await importAllMetaLeads(token)
    if (r.created > 0) revalidatePath("/leads")
    if (r.errors.length) console.error("Meta lead import errors:", r.errors.slice(0, 5))
    return { ok: true, pageName: r.pageName, forms: r.forms, found: r.found, created: r.created, errors: r.errors.length }
  } catch (err) {
    return { ok: false, error: explainMetaError((err as Error).message) }
  }
}

export type MetaConnectState =
  | { ok: true; pages: string[]; permanent: boolean; imported: number }
  | { ok: false; error: string }

export async function connectMeta(_prev: MetaConnectState | null, formData: FormData): Promise<MetaConnectState> {
  const ctx = await requireSession()
  if (!ctxCan(ctx, "leads.manage")) throw new ForbiddenError("leads.manage")

  const input = String(formData.get("token") ?? "")
  try {
    const saved = await upgradeAndStoreMetaToken(input, ctx.userId)
    let imported = 0
    try {
      imported = (await importAllMetaLeads(saved.token, { subscribe: true })).created
    } catch {
      // Token is saved; the background sync retries the import.
    }
    revalidatePath("/leads")
    return { ok: true, pages: saved.pages, permanent: saved.expiresAt === 0, imported }
  } catch (err) {
    return { ok: false, error: explainMetaError((err as Error).message) }
  }
}
