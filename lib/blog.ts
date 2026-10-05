import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { rowToArticle, isLocaleLive, type Article, type ArticleLang } from "@/lib/article-model"
import { draftRowToArticle, type DraftRow } from "@/lib/article-drafts"

export type { Article } from "@/lib/article-model"

/** Published articles (any locale), newest first. Service client: anonymous readers bypass RLS. */
export async function listPublishedArticles(): Promise<Article[]> {
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from("blog_posts")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
    return (data ?? []).map((r) => rowToArticle(r as Record<string, unknown>))
  } catch {
    return []
  }
}

/** Published articles that are complete in `lang` — the only ones a reader of that locale sees. */
export async function listLiveArticles(lang: ArticleLang): Promise<Article[]> {
  return (await listPublishedArticles()).filter((a) => isLocaleLive(a, lang))
}

/** A published article by slug, or null. Locale availability is checked by the caller. */
export async function getPublishedArticle(slug: string): Promise<Article | null> {
  try {
    const svc = createServiceClient()
    const { data } = await svc.from("blog_posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle()
    return data ? rowToArticle(data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Every private draft (briefs, drafts, approved, live) for the control center editor. */
export async function listAllArticles(): Promise<Article[]> {
  const svc = createServiceClient()
  const { data } = await svc.from("article_drafts").select("*").order("updated_at", { ascending: false })
  return ((data ?? []) as DraftRow[]).map(draftRowToArticle)
}
