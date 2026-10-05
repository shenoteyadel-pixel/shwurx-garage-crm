import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"
import { getSessionContext, ctxCan } from "@/lib/rbac/context"
import { normalizeDocument } from "./normalize"
import { seedDocument } from "./seed"
import { deploymentMode } from "./env"
import type { RevisionSummary, WebsiteDocument } from "./types"

export const PREVIEW_COOKIE = "shwurx_site_preview"

/** Where the rendered document came from — shown in the editor and preview bar. */
export type DocSource = "published" | "legacy" | "seed" | "draft-preview" | "revision-preview"

export interface RenderDocument {
  doc: WebsiteDocument
  source: DocSource
  /** true when an authorised editor is viewing an unpublished draft/revision */
  preview: boolean
  previewLabel: string | null
  /** CMS tables exist in this database */
  cmsAvailable: boolean
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(err.message ?? "")
  )
}

interface DocRow {
  draft: unknown
  draft_version: number
  published_revision_id: number | null
  updated_at: string | null
  updated_by_name: string | null
}

/** Reads the singleton row. `null` row = tables exist but not initialised. */
export const readDocumentRow = cache(
  async (): Promise<{ available: boolean; row: DocRow | null; error: string | null }> => {
    try {
      const svc = createServiceClient()
      const { data, error } = await svc
        .from("website_documents")
        .select("draft, draft_version, published_revision_id, updated_at, updated_by_name")
        .eq("id", 1)
        .maybeSingle()
      if (error) {
        if (isMissingTable(error)) return { available: false, row: null, error: null }
        return { available: false, row: null, error: error.message }
      }
      return { available: true, row: (data as DocRow) ?? null, error: null }
    } catch (e) {
      return { available: false, row: null, error: (e as Error).message }
    }
  },
)

export async function readRevision(id: number): Promise<WebsiteDocument | null> {
  const svc = createServiceClient()
  const { data } = await svc.from("website_revisions").select("document").eq("id", id).maybeSingle()
  return data ? normalizeDocument(data.document) : null
}

/**
 * Legacy fallback used until the CMS migration is applied and something is
 * published: shipped defaults + the existing site_content overrides + public
 * phone/email from settings, so the live site keeps its current customisations.
 */
export const legacyDocument = cache(async (): Promise<WebsiteDocument> => {
  const doc = seedDocument()
  try {
    const svc = createServiceClient()
    const [{ data: sc }, { data: st }] = await Promise.all([
      svc.from("site_content").select("en, ar, images").eq("id", 1).maybeSingle(),
      svc.from("settings").select("phone, email").eq("id", 1).maybeSingle(),
    ])
    if (sc) {
      doc.strings = { en: (sc.en as Record<string, unknown>) ?? {}, ar: (sc.ar as Record<string, unknown>) ?? {} }
      doc.images = (sc.images as Record<string, string>) ?? {}
    }
    if (st) {
      doc.business.phone = st.phone ?? ""
      doc.business.whatsapp = st.phone ?? ""
      doc.business.email = st.email ?? ""
    }
  } catch {
    /* fall back to pure defaults */
  }
  return normalizeDocument(doc)
})

/**
 * Production before the first explicit publication: only what the legacy site
 * already had. New brand/service detail pages and custom pages stay hidden so
 * shipping code never publishes seeded content by itself.
 */
function legacyOnly(doc: WebsiteDocument): WebsiteDocument {
  return {
    ...doc,
    brands: doc.brands.map((b) => ({ ...b, visible: false })),
    services: doc.services.map((s) => ({ ...s, visible: false })),
    pages: { ...doc.pages, custom: doc.pages.custom.map((p) => ({ ...p, visible: false })) },
    seo: { ...doc.seo, redirects: [] },
  }
}

export class PublishedReadError extends Error {}

const getPublished = cache(async (): Promise<{ doc: WebsiteDocument; source: DocSource; available: boolean }> => {
  const { available, row, error } = await readDocumentRow()
  // A real DB error is not "nothing published": never substitute seeds for a
  // publication that may exist.
  if (error) throw new PublishedReadError(`Website content unavailable: ${error}`)
  if (available && row?.published_revision_id) {
    let doc = await readRevision(row.published_revision_id).catch(() => null)
    if (!doc) doc = await readRevision(row.published_revision_id).catch(() => null)
    if (!doc) throw new PublishedReadError(`Published revision #${row.published_revision_id} could not be read`)
    return { doc, source: "published", available }
  }
  const legacy = await legacyDocument()
  if (deploymentMode() === "production") return { doc: legacyOnly(legacy), source: "legacy", available }
  // Non-production previews (noindex) may review the seeded content.
  return { doc: legacy, source: "seed", available }
})

/** Published (or legacy) document only — never a draft. Used by public intake. */
export async function getPublishedDocument(): Promise<WebsiteDocument> {
  return (await getPublished()).doc
}

/** Like getPublishedDocument, but returns null instead of throwing on read failure. */
export async function getPublishedDocumentStrict(): Promise<WebsiteDocument | null> {
  try {
    return (await getPublished()).doc
  } catch {
    return null
  }
}

/**
 * Document for public rendering. An editor with `website.manage` who has
 * switched on preview sees the draft (or a chosen revision); everyone else —
 * including crawlers — always gets the published revision.
 */
export const getRenderDocument = cache(async (): Promise<RenderDocument> => {
  const pub = await getPublished()
  const base: RenderDocument = {
    doc: pub.doc,
    source: pub.source,
    preview: false,
    previewLabel: null,
    cmsAvailable: pub.available,
  }
  const jar = await cookies()
  const flag = jar.get(PREVIEW_COOKIE)?.value
  if (!flag || !pub.available) return base

  const ctx = await getSessionContext()
  if (!ctxCan(ctx, "website.manage")) return base

  if (flag === "draft") {
    const { row } = await readDocumentRow()
    if (row?.draft) {
      return {
        ...base,
        doc: normalizeDocument(row.draft),
        source: "draft-preview",
        preview: true,
        previewLabel: `Draft v${row.draft_version}`,
      }
    }
  }
  const m = /^rev:(\d+)$/.exec(flag)
  if (m) {
    const doc = await readRevision(Number(m[1]))
    if (doc) return { ...base, doc, source: "revision-preview", preview: true, previewLabel: `Revision #${m[1]}` }
  }
  return base
})

export interface EditorState {
  available: boolean
  initialised: boolean
  error: string | null
  draft: WebsiteDocument
  draftVersion: number
  publishedRevisionId: number | null
  updatedAt: string | null
  updatedByName: string | null
  revisions: RevisionSummary[]
  /** draft differs from published (cheap JSON comparison) */
  hasUnpublished: boolean
}

export async function getEditorState(): Promise<EditorState> {
  const { available, row, error } = await readDocumentRow()
  const legacy = await legacyDocument()
  if (!available || !row) {
    return {
      available,
      initialised: false,
      error,
      draft: legacy,
      draftVersion: 0,
      publishedRevisionId: null,
      updatedAt: null,
      updatedByName: null,
      revisions: [],
      hasUnpublished: false,
    }
  }
  const svc = createServiceClient()
  const { data: revs } = await svc
    .from("website_revisions")
    .select("id, kind, draft_version, note, created_at, created_by_name")
    .order("id", { ascending: false })
    .limit(30)
  const draft = normalizeDocument(row.draft)
  const published = row.published_revision_id ? await readRevision(row.published_revision_id) : null
  return {
    available,
    initialised: true,
    error,
    draft,
    draftVersion: row.draft_version,
    publishedRevisionId: row.published_revision_id,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
    revisions: (revs ?? []).map((r) => ({
      id: r.id as number,
      kind: r.kind as RevisionSummary["kind"],
      draftVersion: r.draft_version as number,
      note: (r.note as string) ?? null,
      createdAt: r.created_at as string,
      createdByName: (r.created_by_name as string) ?? null,
    })),
    hasUnpublished: !published || JSON.stringify(published) !== JSON.stringify(draft),
  }
}
