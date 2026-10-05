"use server"

import { revalidatePath } from "next/cache"
import { put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { canMutateCms, PREVIEW_MUTATION_MESSAGE } from "@/lib/website/env"
import { readDocumentRow } from "@/lib/website/store"

/** Same order as the versioned CMS: permission first, then deployment policy. */
async function legacyGuard() {
  const ctx = await requirePermission("website.manage")
  if (!canMutateCms()) throw new Error(PREVIEW_MUTATION_MESSAGE)
  return ctx
}

const RETIRED =
  "Text and images are now edited in Site builder. The old editor is retired because the public site no longer reads it."

/** Old Text/Images writes would be silently ignored once the versioned site exists. */
async function legacyContentGuard() {
  const ctx = await legacyGuard()
  const { available, row } = await readDocumentRow()
  if (available && row) throw new Error(RETIRED)
  return ctx
}

/**
 * Website Control Center actions. All are gated on `website.manage`, the
 * permission held by Owner, General Manager and the website-only Marketing
 * role. Content is stored in the single `site_content` row and deep-merged
 * over the i18n dictionary at render time (see lib/site-content.ts).
 */

const clean = (v: FormDataEntryValue | null): string => (v == null ? "" : String(v).trim())

/** Drop empty strings so cleared fields fall back to the shipped default. */
function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      if (v.trim()) out[k] = v
    } else if (Array.isArray(v)) {
      if (v.length) out[k] = v
    } else if (v && typeof v === "object") {
      const nested = pruneEmpty(v as Record<string, unknown>)
      if (Object.keys(nested).length) out[k] = nested
    } else if (v != null) {
      out[k] = v
    }
  }
  return out
}

/**
 * Save editable site text for one locale. The form posts flat keys like
 * `home.heroTitle1`; we rebuild the nested override object, prune empties and
 * merge it into the stored `en` / `ar` JSON.
 */
export async function saveSiteContent(formData: FormData) {
  const ctx = await legacyContentGuard()
  const locale = clean(formData.get("locale")) === "ar" ? "ar" : "en"

  const nested: Record<string, unknown> = {}
  for (const [key, raw] of formData.entries()) {
    if (key === "locale") continue
    if (!key.includes(".")) continue
    if (typeof raw !== "string") continue
    const parts = key.split(".")
    let node = nested
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      node[p] = (node[p] as Record<string, unknown>) ?? {}
      node = node[p] as Record<string, unknown>
    }
    node[parts[parts.length - 1]] = raw
  }
  const pruned = pruneEmpty(nested)

  const svc = createServiceClient()
  const { error } = await svc
    .from("site_content")
    .update({ [locale]: pruned, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", 1)
  if (error) throw new Error(error.message)

  await logAction(ctx, "site_content_updated", "site_content", locale)
  revalidatePath("/", "layout")
  revalidatePath("/marketing")
}

/** Save the named image slots (e.g. home.hero) — merged into images JSON. */
export async function saveSiteImages(images: Record<string, string>) {
  const ctx = await legacyContentGuard()
  const svc = createServiceClient()
  const { data } = await svc.from("site_content").select("images").eq("id", 1).maybeSingle()
  const current = (data?.images as Record<string, string>) ?? {}
  const merged = { ...current }
  for (const [k, v] of Object.entries(images)) {
    if (v && v.trim()) merged[k] = v
    else delete merged[k]
  }
  const { error } = await svc
    .from("site_content")
    .update({ images: merged, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", 1)
  if (error) throw new Error(error.message)
  await logAction(ctx, "site_images_updated", "site_content", Object.keys(images).join(","))
  revalidatePath("/", "layout")
  revalidatePath("/marketing")
}

/**
 * Upload an image to Blob and return its public URL. Blog covers still use
 * this after the CMS exists, so only permission + deployment policy apply;
 * the retired-content guard is reserved for the old Text/Images writes.
 */
export async function uploadWebsiteImage(formData: FormData): Promise<{ url: string }> {
  await legacyGuard()
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided.")
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.")
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be 8MB or smaller.")
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")
  const blob = await put(`website/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`, file, {
    access: "public",
    contentType: file.type,
  })
  return { url: blob.url }
}

