"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePermission, logAction } from "@/lib/rbac/context"
import { canMutateCms, PREVIEW_MUTATION_MESSAGE } from "@/lib/website/env"
import {
  articleToRow,
  matrixToRows,
  publishIssues,
  rowToArticle,
  WORKFLOWS,
  type Article,
  type ArticleWorkflow,
} from "@/lib/article-model"
import {
  editorialToArticle,
  isEmptyBrief,
  type DefaultCover,
  type EditorialArticle,
} from "@/lib/article-model"
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

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Fields an approval covers; changing any of them after approval sends it back to review. */
const reviewedFingerprint = (a: Article) => JSON.stringify([a.content, a.sources, a.brandSlug, a.serviceSlugs, a.coverUrl])

function revalidateArticle(slug: string, brandSlug: string | null) {
  for (const p of ["/blog", `/blog/${slug}`, "/ar/blog", `/ar/blog/${slug}`]) revalidatePath(p)
  if (brandSlug) revalidatePath(`/brands/${brandSlug}`)
  revalidatePath("/sitemap.xml")
  revalidatePath("/marketing")
}

/**
 * Create or update an article. `expectedRevision` makes concurrent edits fail
 * loudly instead of overwriting each other. Publishing is only accepted when
 * every rule in `publishIssues` holds on the server copy.
 */
export async function saveArticle(input: Article, expectedRevision: number | null, intent: ArticleIntent = "save"): Promise<SaveArticleResult> {
  const ctx = await guard()
  const svc = createServiceClient()

  const slug = input.slug.trim().toLowerCase()
  if (!SLUG.test(slug)) return { ok: false, error: "Slug must be lowercase ASCII words separated by hyphens (e.g. porsche-pdk-service)." }
  if (!WORKFLOWS.includes(input.workflow)) return { ok: false, error: "Unknown workflow stage." }

  const existingRow = input.id ? (await svc.from("blog_posts").select("*").eq("id", input.id).maybeSingle()).data : null
  if (input.id && !existingRow) return { ok: false, error: "This article no longer exists. Reload the list." }
  const existing = existingRow ? rowToArticle(existingRow as Record<string, unknown>) : null
  if (existing && expectedRevision !== existing.revision) {
    return { ok: false, conflict: true, error: "Someone else saved this article since you opened it. Reload to see their changes before saving." }
  }

  const next: Article = { ...input, slug, brandSlug: input.brandSlug || null, serviceSlugs: [...new Set(input.serviceSlugs)] }
  let workflow: ArticleWorkflow = next.workflow

  if (intent === "approve") {
    workflow = "approved"
    next.reviewedBy = ctx.name
    next.reviewedAt = new Date().toISOString()
  } else if (existing?.workflow === "approved" && reviewedFingerprint(existing) !== reviewedFingerprint(next)) {
    // Approval covered the old copy; edited copy needs a fresh review.
    workflow = "in_review"
    next.reviewedBy = null
    next.reviewedAt = null
  } else if (workflow === "approved" && existing?.workflow !== "approved") {
    return { ok: false, error: "Use Approve to mark an article reviewed — that records who reviewed it." }
  } else if (existing) {
    next.reviewedBy = existing.reviewedBy
    next.reviewedAt = existing.reviewedAt
  }
  next.workflow = workflow

  let status = existing?.status ?? "draft"
  if (intent === "publish") status = "published"
  if (intent === "unpublish") status = "draft"
  next.status = status

  if (status === "published") {
    const issues = publishIssues(next)
    if (issues.length) {
      return {
        ok: false,
        issues,
        error: existing?.status === "published" && intent !== "publish"
          ? "This live article would break publishing rules. Fix the issues or unpublish it first."
          : "Not ready to publish.",
      }
    }
  }

  const row: Record<string, unknown> = {
    ...articleToRow(next),
    author: existing?.author ?? ctx.name,
    updated_at: new Date().toISOString(),
    revision: (existing?.revision ?? 0) + 1,
  }
  if (status === "published" && !existing?.publishedAt) row.published_at = new Date().toISOString()

  const res = existing
    ? await svc.from("blog_posts").update(row).eq("id", existing.id).eq("revision", existing.revision).select("*").maybeSingle()
    : await svc.from("blog_posts").insert(row).select("*").maybeSingle()

  if (res.error) {
    if (res.error.code === "23505") {
      return { ok: false, error: /article_key/.test(res.error.message) ? "Another article already uses this matrix key." : `The slug "${slug}" is already used by another article.` }
    }
    return { ok: false, error: res.error.message }
  }
  if (!res.data) return { ok: false, conflict: true, error: "Someone else saved this article at the same moment. Reload and try again." }

  const saved = rowToArticle(res.data as Record<string, unknown>)
  const action = intent === "publish" ? "article_published" : intent === "unpublish" ? "article_unpublished" : intent === "approve" ? "article_approved" : existing ? "article_updated" : "article_created"
  await logAction(ctx, action, "blog_post", saved.id)

  revalidateArticle(saved.slug, saved.brandSlug)
  if (existing && existing.slug !== saved.slug) revalidateArticle(existing.slug, existing.brandSlug)
  return { ok: true, article: saved }
}

export async function deleteArticle(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard()
  const svc = createServiceClient()
  const { data } = await svc.from("blog_posts").select("slug, brand_slug, status").eq("id", id).maybeSingle()
  if (!data) return { ok: false, error: "Article not found." }
  if (data.status === "published") return { ok: false, error: "Unpublish the article before deleting it." }
  const { error } = await svc.from("blog_posts").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  await logAction(ctx, "article_deleted", "blog_post", id)
  revalidateArticle(data.slug as string, (data.brand_slug as string) ?? null)
  return { ok: true }
}

/**
 * Creates one brief-stage draft per matrix topic that does not exist yet.
 * Never overwrites an existing article and never writes body copy — briefs
 * stay unpublishable until an editor writes and approves both locales.
 */
export async function importEditorialBriefs(): Promise<{ ok: boolean; created: number; skipped: string[]; error?: string }> {
  const ctx = await guard()
  const svc = createServiceClient()
  const { data: existing, error: readError } = await svc.from("blog_posts").select("article_key, slug")
  if (readError) return { ok: false, created: 0, skipped: [], error: readError.message }

  const keys = new Set((existing ?? []).map((r) => r.article_key).filter(Boolean))
  const slugs = new Set((existing ?? []).map((r) => r.slug))
  const skipped: string[] = []
  const rows = matrixToRows((matrix as { articles: Parameters<typeof matrixToRows>[0] }).articles).filter((r) => {
    if (keys.has(r.article_key)) return false
    if (slugs.has(r.slug)) {
      skipped.push(String(r.article_key))
      return false
    }
    return true
  })
  if (rows.length === 0) return { ok: true, created: 0, skipped }

  const now = new Date().toISOString()
  const { error } = await svc.from("blog_posts").insert(rows.map((r) => ({ ...r, author: ctx.name, updated_at: now })))
  if (error) return { ok: false, created: 0, skipped, error: error.message }
  await logAction(ctx, "article_briefs_imported", "blog_post", String(rows.length))
  revalidatePath("/marketing")
  return { ok: true, created: rows.length, skipped }
}

/**
 * Loads the 75 bilingual article bodies. New topics are inserted; topics that
 * are still untouched briefs get their copy filled in. Anything an editor has
 * already written, reviewed or published is left alone. Everything lands in
 * review as an unpublished draft with the brand's garage hero as an
 * illustrative default cover (an owner-set cover is kept).
 */
export async function importEditorialArticles(): Promise<{ ok: boolean; created: number; filled: number; skipped: string[]; error?: string }> {
  const ctx = await guard()
  const svc = createServiceClient()
  const { data: existing, error: readError } = await svc.from("blog_posts").select("*")
  if (readError) return { ok: false, created: 0, filled: 0, skipped: [], error: readError.message }

  const rows = (existing ?? []).map((r) => rowToArticle(r as Record<string, unknown>))
  const byKey = new Map(rows.filter((a) => a.key).map((a) => [a.key as string, a]))
  const bySlug = new Map(rows.map((a) => [a.slug, a]))
  const items = editorial as unknown as EditorialArticle[]
  const slugToKey = new Map(items.map((e) => [e.slug, e.id]))
  const covers = new Map<string, DefaultCover>(
    (brandHeroes as { brandSlug: string; url: string; alt: DefaultCover["alt"]; caption: DefaultCover["caption"] }[]).map((h) => [
      h.brandSlug,
      { url: h.url, alt: h.alt, caption: h.caption },
    ]),
  )

  const inserts: Record<string, unknown>[] = []
  const skipped: string[] = []
  let filled = 0
  const now = new Date().toISOString()

  for (const e of items) {
    const base = byKey.get(e.id) ?? bySlug.get(e.slug) ?? null
    const cover = covers.get(e.brandSlug) ?? null
    if (!base) {
      inserts.push({ ...articleToRow(editorialToArticle(e, slugToKey, cover, null)), author: ctx.name, updated_at: now })
      continue
    }
    if (!isEmptyBrief(base) || (base.key && base.key !== e.id)) {
      skipped.push(e.id)
      continue
    }
    const next = editorialToArticle(e, slugToKey, cover, base)
    const { data, error } = await svc
      .from("blog_posts")
      .update({ ...articleToRow(next), revision: base.revision + 1, updated_at: now })
      .eq("id", base.id)
      .eq("revision", base.revision)
      .select("id")
    if (error) return { ok: false, created: 0, filled, skipped, error: error.message }
    if (data?.length) filled++
    else skipped.push(e.id)
  }

  if (inserts.length) {
    const { error } = await svc.from("blog_posts").insert(inserts)
    if (error) return { ok: false, created: 0, filled, skipped, error: error.message }
  }
  await logAction(ctx, "article_bodies_imported", "blog_post", `${inserts.length} new, ${filled} filled`)
  revalidatePath("/marketing")
  return { ok: true, created: inserts.length, filled, skipped }
}
