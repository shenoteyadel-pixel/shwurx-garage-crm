"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { ctxCan, requirePermission, logAction, type SessionContext } from "@/lib/rbac/context"
import { normalizeDocument, parseDocument, validateDocument, type ValidationIssue } from "@/lib/website/normalize"
import { canMutateCms, PREVIEW_MUTATION_MESSAGE } from "@/lib/website/env"
import { legacyDocument, readDocumentRow, readRevision, PREVIEW_COOKIE } from "@/lib/website/store"
import type { MediaAsset, WebsiteDocument } from "@/lib/website/types"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; currentVersion?: number; issues?: ValidationIssue[] }

const UNAVAILABLE = "Website storage is not set up in this database yet. Apply scripts/050_website_cms.sql first."

function refreshPublic() {
  revalidatePath("/", "layout")
}

/** Permission first, then the deployment policy; only then any data is read. */
async function guard() {
  const ctx = await requirePermission("website.manage")
  if (!canMutateCms()) throw new CmsBlocked()
  const { available, row } = await readDocumentRow()
  return { ctx, available, row }
}

class CmsBlocked extends Error {}

const TRACKING_DENIED =
  "Tracking settings changed. Changing, activating or rolling back analytics requires the \"Manage website tracking\" permission."

/** Stable comparison of the analytics block; key order never matters. */
function analyticsKey(doc: WebsiteDocument | null): string {
  const a = normalizeDocument(doc ?? {}).analytics
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v
  return JSON.stringify(sort(a))
}

/**
 * website.manage alone may edit content but never change, activate or roll back
 * marketing providers. Any difference in the analytics block needs marketing.manage.
 */
function trackingChangeAllowed(ctx: SessionContext, from: WebsiteDocument | null, to: WebsiteDocument | null): boolean {
  return analyticsKey(from) === analyticsKey(to) || ctxCan(ctx, "marketing.manage")
}

async function publishedDoc(revisionId: number | null): Promise<WebsiteDocument | null> {
  return revisionId ? await readRevision(revisionId) : null
}

/** Runs a mutation, turning the preview block into a normal error result. */
async function mutation<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof CmsBlocked) return { ok: false, error: PREVIEW_MUTATION_MESSAGE }
    throw e
  }
}

function validVersion(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0
}
const BAD_VERSION = "Missing draft version. Reload the Website Center and try again."

/** One-time import: shipped defaults + existing site_content overrides become draft v1. */
export async function initialiseWebsite(): Promise<Result<{ version: number }>> {
  return mutation(initialiseInner)
}
async function initialiseInner(): Promise<Result<{ version: number }>> {
  const { ctx, available, row } = await guard()
  if (!available) return { ok: false, error: UNAVAILABLE }
  if (row) return { ok: false, error: "Already initialised." }
  const doc = await legacyDocument()
  const svc = createServiceClient()
  const { error } = await svc.from("website_documents").insert({
    id: 1,
    draft: doc,
    draft_version: 1,
    updated_by: ctx.userId,
    updated_by_name: ctx.name,
  })
  if (error) return { ok: false, error: error.message }
  await svc.from("website_revisions").insert({
    document: doc,
    draft_version: 1,
    kind: "imported",
    note: "Imported from previous site content",
    created_by: ctx.userId,
    created_by_name: ctx.name,
  })
  await logAction(ctx, "website.initialise", "website", "1")
  return { ok: true, version: 1 }
}

export async function saveWebsiteDraft(input: unknown, expectedVersion: number): Promise<Result<{ version: number }>> {
  return mutation(() => saveInner(input, expectedVersion))
}
async function saveInner(input: unknown, expectedVersion: number): Promise<Result<{ version: number }>> {
  const { ctx, available, row } = await guard()
  if (!available) return { ok: false, error: UNAVAILABLE }
  if (!row) return { ok: false, error: "Initialise the website first." }
  if (!validVersion(expectedVersion)) return { ok: false, error: BAD_VERSION, currentVersion: row.draft_version }
  const shape = parseDocument(input)
  if (!shape.ok) return { ok: false, error: "The draft has invalid structure.", issues: shape.issues }
  // Analytics is edited only through the separate marketing action, so a
  // content save always keeps the stored analytics block untouched.
  const doc = { ...shape.doc, analytics: normalizeDocument(row.draft ?? {}).analytics }
  if (!trackingChangeAllowed(ctx, row.draft as WebsiteDocument, doc)) return { ok: false, error: TRACKING_DENIED }
  const svc = createServiceClient()
  const { data, error } = await svc.rpc("website_save_draft", {
    p_expected_version: expectedVersion,
    p_draft: doc,
    p_user: ctx.userId,
    p_user_name: ctx.name,
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; version?: number; error?: string; current_version?: number }
  if (!res.ok) {
    return {
      ok: false,
      error: "Someone else saved a newer draft. Reload to see their changes before saving again.",
      currentVersion: res.current_version,
    }
  }
  await logAction(ctx, "website.save_draft", "website", "1", { version: res.version })
  return { ok: true, version: res.version! }
}

export async function publishWebsite(
  expectedVersion: number,
  note: string,
): Promise<Result<{ revisionId: number; version: number }>> {
  return mutation(() => publishInner(expectedVersion, note))
}
async function publishInner(expectedVersion: number, note: string): Promise<Result<{ revisionId: number; version: number }>> {
  const { ctx, available, row } = await guard()
  if (!available) return { ok: false, error: UNAVAILABLE }
  if (!row) return { ok: false, error: "Initialise the website first." }
  if (!validVersion(expectedVersion)) return { ok: false, error: BAD_VERSION, currentVersion: row.draft_version }
  if (expectedVersion !== row.draft_version) {
    return {
      ok: false,
      error: "The draft changed since you loaded it. Reload, review, then publish.",
      currentVersion: row.draft_version,
    }
  }
  const issues = validateDocument(normalizeDocument(row.draft))
  if (issues.some((i) => i.level === "error")) {
    return { ok: false, error: "Fix the errors before publishing.", issues }
  }
  const live = await publishedDoc(row.published_revision_id)
  if (!trackingChangeAllowed(ctx, live, row.draft as WebsiteDocument)) return { ok: false, error: TRACKING_DENIED }
  const svc = createServiceClient()
  const { data, error } = await svc.rpc("website_publish", {
    p_expected_version: expectedVersion,
    p_user: ctx.userId,
    p_user_name: ctx.name,
    p_note: note.slice(0, 500) || null,
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; revision_id?: number; error?: string; current_version?: number }
  if (!res.ok) {
    return {
      ok: false,
      error: res.error === "conflict" ? "The draft changed since you loaded it. Reload, review, then publish." : res.error ?? "Publish failed.",
      currentVersion: res.current_version,
    }
  }
  await logAction(ctx, "website.publish", "website", String(res.revision_id), { version: expectedVersion, note })
  refreshPublic()
  return { ok: true, revisionId: res.revision_id!, version: expectedVersion }
}

/** Copies a revision into the draft. It goes live only after the next publish. */
export async function restoreRevisionToDraft(revisionId: number, expectedVersion: number): Promise<Result<{ version: number }>> {
  return mutation(async () => {
    const { ctx, available } = await guard()
    if (!available) return { ok: false, error: UNAVAILABLE }
    if (!validVersion(revisionId)) return { ok: false, error: "Revision not found." }
    const svc = createServiceClient()
    const { data } = await svc.from("website_revisions").select("document").eq("id", revisionId).maybeSingle()
    if (!data) return { ok: false, error: "Revision not found." }
    const res = await saveInner(data.document, expectedVersion)
    if (res.ok) await logAction(ctx, "website.restore_revision", "website", String(revisionId), { version: res.version })
    return res
  })
}

/** Instant rollback: point the live site at an earlier published revision. */
export async function rollbackToRevision(revisionId: number): Promise<Result> {
  return mutation(() => rollbackInner(revisionId))
}
async function rollbackInner(revisionId: number): Promise<Result> {
  const { ctx, available, row } = await guard()
  if (!available) return { ok: false, error: UNAVAILABLE }
  if (!validVersion(revisionId)) return { ok: false, error: "Revision not found." }
  const svc = createServiceClient()
  const { data } = await svc.from("website_revisions").select("id, kind, document").eq("id", revisionId).maybeSingle()
  if (!data || data.kind !== "published") return { ok: false, error: "Only published revisions can go live." }
  const live = await publishedDoc(row?.published_revision_id ?? null)
  if (!trackingChangeAllowed(ctx, live, data.document as WebsiteDocument)) return { ok: false, error: TRACKING_DENIED }
  const { error } = await svc.from("website_documents").update({ published_revision_id: revisionId }).eq("id", 1)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "website.rollback", "website", String(revisionId))
  refreshPublic()
  return { ok: true }
}

export async function setWebsitePreview(mode: "draft" | `rev:${number}` | "off"): Promise<Result> {
  await requirePermission("website.manage")
  const jar = await cookies()
  if (mode === "off") jar.delete(PREVIEW_COOKIE)
  else jar.set(PREVIEW_COOKIE, mode, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 4 })
  return { ok: true }
}

/**
 * Read-only, so it is allowed on previews. Contains the draft, the live
 * published document and the full revision history so it can be restored.
 */
export async function exportWebsiteBackup(): Promise<Result<{ json: string }>> {
  const ctx = await requirePermission("website.manage")
  const { available, row } = await readDocumentRow()
  let revisions: unknown[] = []
  let published: unknown = null
  if (available && row) {
    const svc = createServiceClient()
    const { data } = await svc
      .from("website_revisions")
      .select("id, kind, draft_version, note, created_at, created_by_name, document")
      .order("id", { ascending: true })
    revisions = data ?? []
    published = (data ?? []).find((r) => r.id === row.published_revision_id)?.document ?? null
  }
  const payload = {
    format: "shwurx-website-backup/v2",
    exportedAt: new Date().toISOString(),
    draftVersion: row?.draft_version ?? 0,
    publishedRevisionId: row?.published_revision_id ?? null,
    draft: row ? normalizeDocument(row.draft) : await legacyDocument(),
    published,
    revisions,
    cmsAvailable: available,
  }
  // Deliberately no audit write: logging fans out owner alerts, and a read
  // must not mutate or notify — especially from a preview on a shared DB.
  void ctx
  return { ok: true, json: JSON.stringify(payload, null, 2) }
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
}

/**
 * Upload a raster image to Blob. SVG and other executable formats are refused.
 * Returns a MediaAsset the editor adds to the draft (needs review until approved).
 */
export async function uploadWebsiteMedia(formData: FormData): Promise<Result<{ asset: MediaAsset }>> {
  const ctx = await requirePermission("website.manage")
  if (!canMutateCms()) return { ok: false, error: PREVIEW_MUTATION_MESSAGE }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." }
  const ext = IMAGE_TYPES[file.type]
  if (!ext) return { ok: false, error: "Only JPG, PNG, WebP or AVIF images are allowed." }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Image must be under 8 MB." }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const sig = Array.from(head.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("")
  const valid =
    sig.startsWith("ffd8ff") || sig === "89504e47" || (sig === "52494646" && head[8] === 0x57) || head[4] === 0x66
  if (!valid) return { ok: false, error: "File content does not match an image." }
  const id = `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const blob = await put(`website/${id}.${ext}`, file, { access: "public", contentType: file.type })
  await logAction(ctx, "website.upload_media", "website", id)
  return {
    ok: true,
    asset: {
      id,
      url: blob.url,
      source: "upload",
      approval: "needs_review",
      alt: { en: "", ar: "" },
      caption: { en: "", ar: "" },
      tags: [],
      width: Number(formData.get("width")) || null,
      height: Number(formData.get("height")) || null,
      focalX: 50,
      focalY: 50,
      publicSafe: false,
      uploadedAt: new Date().toISOString(),
    },
  }
}

export async function validateWebsiteDraft(input: unknown): Promise<ValidationIssue[]> {
  await requirePermission("website.manage")
  return validateDocument(normalizeDocument(input) as WebsiteDocument)
}
