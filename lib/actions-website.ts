"use server"

import { revalidatePath } from "next/cache"
import { put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"

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
  const ctx = await requirePermission("website.manage")
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
  const ctx = await requirePermission("website.manage")
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

/** Upload an image to Blob and return its public URL. */
export async function uploadWebsiteImage(formData: FormData): Promise<{ url: string }> {
  await requirePermission("website.manage")
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

/* ============================ Blog ============================ */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

export async function saveBlogPost(formData: FormData) {
  const ctx = await requirePermission("website.manage")
  const id = clean(formData.get("id"))
  const title = clean(formData.get("title"))
  if (!title) throw new Error("Title is required.")
  const status = clean(formData.get("status")) === "published" ? "published" : "draft"
  let slug = slugify(clean(formData.get("slug")) || title)
  if (!slug) slug = `post-${Date.now()}`

  const svc = createServiceClient()

  const payload: Record<string, unknown> = {
    slug,
    title,
    excerpt: clean(formData.get("excerpt")) || null,
    cover_url: clean(formData.get("cover_url")) || null,
    body: clean(formData.get("body")),
    status,
    author: ctx.name,
    updated_at: new Date().toISOString(),
  }

  if (status === "published") {
    // Set published_at the first time it goes live.
    const existing = id
      ? (await svc.from("blog_posts").select("published_at").eq("id", id).maybeSingle()).data
      : null
    if (!existing?.published_at) payload.published_at = new Date().toISOString()
  }

  if (id) {
    const { error } = await svc.from("blog_posts").update(payload).eq("id", id)
    if (error) throw new Error(error.message)
    await logAction(ctx, "blog_post_updated", "blog_post", id)
  } else {
    const { error } = await svc.from("blog_posts").insert(payload)
    if (error) throw new Error(error.message)
    await logAction(ctx, "blog_post_created", "blog_post", slug)
  }

  revalidatePath("/blog")
  revalidatePath(`/blog/${slug}`)
  revalidatePath("/marketing")
}

export async function deleteBlogPost(id: string) {
  const ctx = await requirePermission("website.manage")
  const svc = createServiceClient()
  const { error } = await svc.from("blog_posts").delete().eq("id", id)
  if (error) throw new Error(error.message)
  await logAction(ctx, "blog_post_deleted", "blog_post", id)
  revalidatePath("/blog")
  revalidatePath("/marketing")
}
