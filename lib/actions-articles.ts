"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { canMutateCms, PREVIEW_MUTATION_MESSAGE } from "@/lib/website/env"
import {
  matrixToRows,
  publishIssues,
  rowToArticle,
  WORKFLOWS,
  editorialToArticle,
  type Article,
  type ArticleWorkflow,
  type DefaultCover,
  type EditorialArticle,
} from "@/lib/article-model"
import { articleToDoc, draftRowToArticle, fillMissing, publicSnapshot, withPublishedSnapshot, type DraftRow } from "@/lib/article-drafts"
import matrix from "@/data/editorial/matrix-75.json"
import editorial from "@/data/editorial/articles-75.json"
import brandHeroes from "@/data/editorial/brand-heroes-v2.json"

async function guard() {
  const ctx = await requirePermission("website.manage")
  if (!canMutateCms()) throw new Error(PREVIEW_MUTATION_MESSAGE)
  return ctx
}

export type ArticleIntent = "save" | "approve" | "publish" | "unpublish"

export type SaveArticleResult =
  | { ok: true; article: Article }
  | { ok: false; error: string; issues?: string[]; conflict?: boolean }

type Svc = ReturnType<typeof createServiceClient>
type PgError = { code?: string; message: string } | null

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONFLICT = "Someone else changed this article since you opened it. Reload to see their changes first."

/** Fields an approval covers; changing any of them after approval sends it back to review. */
const reviewedFingerprint = (a: Article) =>
  JSON.stringify([a.slug, a.content, a.sources, a.brandSlug, a.serviceSlugs, a.relatedKeys, a.coverUrl, a.coverIllustrative])

function revalidateArticle(article: Article, previous: Article["published"]) {
  const paths = new Set(["/blog", "/ar/blog", "/sitemap.xml", "/marketing"])
  for (const slug of [article.slug, previous?.slug]) {
    if (slug) for (const prefix of ["", "/ar"]) paths.add(`${prefix}/blog/${slug}`)
  }
  for (const brand of [article.brandSlug, previous?.brandSlug]) {
    if (brand) for (const prefix of ["", "/ar"]) paths.add(`${prefix}/brands/${brand}`)
  }
  for (const path of paths) revalidatePath(path)
}

function rpcError(error: NonNullable<PgError>, slug?: string): SaveArticleResult {
  if (error.code === "40001") return { ok: false, conflict: true, error: CONFLICT }
  if (error.code === "23505") {
    return { ok: false, error: /article_key/.test(error.message) ? "Another article already uses this matrix key." : `The slug "${slug}" is already used by another article.` }
  }
  if (error.code === "55000") return { ok: false, error: "Approve the article before publishing it." }
  return { ok: false, error: error.message }
}

async function readDraft(svc: Svc, id: string) {
  const { data, error } = await svc.from("article_drafts").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? editorArticle(svc, data as DraftRow) : null
}

async function editorArticle(svc: Svc, row: DraftRow) {
  const draft = draftRowToArticle(row)
  if (row.published_revision == null) return withPublishedSnapshot(draft, null)
  const { data, error } = await svc.from("blog_posts").select("*").eq("article_key", row.article_key).eq("status", "published").maybeSingle()
  if (error) throw error
  return withPublishedSnapshot(draft, data ? rowToArticle(data as Record<string, unknown>) : null)
}

async function saveDraft(
  svc: Svc,
  a: Article,
  expectedRevision: number | null,
  action: "create" | "save" | "approve" | "import",
  actor: string,
): Promise<{ data: DraftRow | null; error: PgError }> {
  const { data, error } = await svc.rpc("article_save", {
    p_id: a.id || null,
    p_expected_revision: a.id ? expectedRevision : null,
    p_key: a.key || a.slug,
    p_slug: a.slug,
    p_brand: a.brandSlug,
    p_workflow: a.workflow,
    p_doc: articleToDoc(a),
    p_action: action,
    p_actor: actor,
  })
  return { data: (data as DraftRow | null) ?? null, error }
}

/**
 * Saves, approves, publishes or unpublishes a private draft. Saving never
 * touches the live article; only `publish` copies a redacted snapshot of the
 * stored, approved draft to `blog_posts`. Every write is revision-checked.
 */
export async function saveArticle(input: Article, expectedRevision: number | null, intent: ArticleIntent = "save"): Promise<SaveArticleResult> {
  const ctx = await guard()
  const svc = createServiceClient()

  const slug = input.slug.trim().toLowerCase()
  if (!SLUG.test(slug)) return { ok: false, error: "Slug must be lowercase ASCII words separated by hyphens (e.g. porsche-pdk-service)." }
  if (!WORKFLOWS.includes(input.workflow)) return { ok: false, error: "Unknown workflow stage." }

  const existing = input.id ? await readDraft(svc, input.id) : null
  if (input.id && !existing) return { ok: false, error: "This article no longer exists. Reload the list." }
  if (existing && expectedRevision !== existing.revision) return { ok: false, conflict: true, error: CONFLICT }

  const next: Article = { ...input, slug, brandSlug: input.brandSlug || null, serviceSlugs: [...new Set(input.serviceSlugs)] }

  if (intent === "publish" || intent === "unpublish") {
    if (!existing) return { ok: false, error: "Save the article first." }
    if (reviewedFingerprint(existing) !== reviewedFingerprint(next) || JSON.stringify(existing.content) !== JSON.stringify(next.content)) {
      return { ok: false, error: "You have unsaved changes. Save and approve them before changing what is live." }
    }
    if (intent === "publish") {
      const issues = publishIssues({ ...existing, status: "published" })
      if (issues.length) return { ok: false, issues, error: "Not ready to publish." }
      const { error } = await svc.rpc("article_publish", {
        p_id: existing.id,
        p_expected_revision: existing.revision,
        p_post: publicSnapshot(existing),
        p_actor: ctx.name,
      })
      if (error) return rpcError(error, slug)
    } else {
      const { error } = await svc.rpc("article_unpublish", { p_id: existing.id, p_expected_revision: existing.revision, p_actor: ctx.name })
      if (error) return rpcError(error, slug)
    }
    const saved = await readDraft(svc, existing.id)
    if (!saved) return { ok: false, error: "Article disappeared after the update. Reload the list." }
    await logAction(ctx, intent === "publish" ? "article_published" : "article_unpublished", "article_draft", saved.id)
    revalidateArticle(saved, existing.published)
    return { ok: true, article: saved }
  }

  let workflow: ArticleWorkflow = next.workflow
  if (intent === "approve") {
    workflow = "approved"
    next.reviewedBy = ctx.name
    next.reviewedAt = new Date().toISOString()
  } else if (existing?.workflow === "approved" && reviewedFingerprint(existing) !== reviewedFingerprint(next)) {
    workflow = "in_review"
    next.reviewedBy = null
    next.reviewedAt = null
  } else if (workflow === "approved" && existing?.workflow !== "approved") {
    return { ok: false, error: "Use Approve to mark an article reviewed — that records who reviewed it." }
  } else {
    next.reviewedBy = existing?.reviewedBy ?? null
    next.reviewedAt = existing?.reviewedAt ?? null
  }
  next.workflow = workflow
  next.author = existing?.author ?? ctx.name

  const { data, error } = await saveDraft(svc, next, expectedRevision, intent === "approve" ? "approve" : existing ? "save" : "create", ctx.name)
  if (error) return rpcError(error, slug)
  if (!data) return { ok: false, conflict: true, error: CONFLICT }

  const saved = await editorArticle(svc, data)
  await logAction(ctx, intent === "approve" ? "article_approved" : existing ? "article_updated" : "article_created", "article_draft", saved.id)
  revalidatePath("/marketing")
  return { ok: true, article: saved }
}

/** Drafts keep an append-only history, so they are retired (unpublished) rather than deleted. */
export async function deleteArticle(_id: string): Promise<{ ok: boolean; error?: string }> {
  await guard()
  return { ok: false, error: "Articles keep an audit history and cannot be deleted. Unpublish it to take it off the site." }
}

async function readAllDrafts(svc: Svc) {
  const { data, error } = await svc.from("article_drafts").select("*")
  return { drafts: ((data ?? []) as DraftRow[]).map(draftRowToArticle), error }
}

/** Creates one private brief-stage draft per matrix topic that does not exist yet. */
export async function importEditorialBriefs(): Promise<{ ok: boolean; created: number; skipped: string[]; error?: string }> {
  const ctx = await guard()
  const svc = createServiceClient()
  const { drafts, error: readError } = await readAllDrafts(svc)
  if (readError) return { ok: false, created: 0, skipped: [], error: readError.message }

  const keys = new Set(drafts.map((d) => d.key))
  const slugs = new Set(drafts.map((d) => d.slug))
  const skipped: string[] = []
  let created = 0
  for (const row of matrixToRows((matrix as { articles: Parameters<typeof matrixToRows>[0] }).articles)) {
    const a = { ...rowToArticle(row), id: "", legacy: false, author: ctx.name }
    if (keys.has(a.key)) continue
    if (slugs.has(a.slug)) {
      skipped.push(String(a.key))
      continue
    }
    const { error } = await saveDraft(svc, a, null, "import", ctx.name)
    if (error) return { ok: false, created, skipped, error: error.message }
    created++
  }
  if (created) await logAction(ctx, "article_briefs_imported", "article_draft", String(created))
  revalidatePath("/marketing")
  return { ok: true, created, skipped }
}

/**
 * Loads the 75 bilingual bodies into private drafts. New topics are created in
 * review; existing drafts only get fields that are still empty, so edited
 * titles, SEO, taxonomy, sources, slugs and covers are never overwritten.
 * Nothing is published and no locale is marked ready.
 */
export async function importEditorialArticles(): Promise<{ ok: boolean; created: number; filled: number; skipped: string[]; error?: string }> {
  const ctx = await guard()
  const svc = createServiceClient()
  const { drafts, error: readError } = await readAllDrafts(svc)
  if (readError) return { ok: false, created: 0, filled: 0, skipped: [], error: readError.message }

  const byKey = new Map(drafts.map((d) => [d.key as string, d]))
  const slugs = new Set(drafts.map((d) => d.slug))
  const items = editorial as unknown as EditorialArticle[]
  const slugToKey = new Map(items.map((e) => [e.slug, e.id]))
  const covers = new Map<string, DefaultCover>(
    (brandHeroes as { brandSlug: string; url: string; alt: DefaultCover["alt"]; caption: DefaultCover["caption"] }[]).map((h) => [
      h.brandSlug,
      { url: h.url, alt: h.alt, caption: h.caption },
    ]),
  )

  const skipped: string[] = []
  let created = 0
  let filled = 0
  for (const e of items) {
    const incoming = { ...editorialToArticle(e, slugToKey, covers.get(e.brandSlug) ?? null, null), author: ctx.name }
    const base = byKey.get(e.id)
    if (!base) {
      if (slugs.has(e.slug)) {
        skipped.push(e.id)
        continue
      }
      const { error } = await saveDraft(svc, incoming, null, "import", ctx.name)
      if (error) return { ok: false, created, filled, skipped, error: error.message }
      created++
      continue
    }
    const { next, changed } = fillMissing(base, incoming)
    if (!changed) continue
    const { error } = await saveDraft(svc, next, base.revision, "import", ctx.name)
    if (error) {
      if (error.code === "40001") {
        skipped.push(e.id)
        continue
      }
      return { ok: false, created, filled, skipped, error: error.message }
    }
    filled++
  }
  if (created || filled) await logAction(ctx, "article_bodies_imported", "article_draft", `${created} new, ${filled} filled`)
  revalidatePath("/marketing")
  return { ok: true, created, filled, skipped }
}
