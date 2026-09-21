import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

export type BlogStatus = "draft" | "published"

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_url: string | null
  body: string
  status: BlogStatus
  published_at: string | null
  created_at: string
  updated_at: string
  author: string | null
}

/** Published posts for the public blog, newest first. Uses the service client
 * so anonymous visitors can read despite RLS. */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from("blog_posts")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
    return (data as BlogPost[]) ?? []
  } catch {
    return []
  }
}

/** A single published post by slug (public). */
export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
    return (data as BlogPost) ?? null
  } catch {
    return null
  }
}

/** All posts (draft + published) for the admin control center. */
export async function listAllPosts(): Promise<BlogPost[]> {
  const svc = createServiceClient()
  const { data } = await svc.from("blog_posts").select("*").order("updated_at", { ascending: false })
  return (data as BlogPost[]) ?? []
}
