import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { getServerI18n } from "@/lib/i18n/server"
import { getPublishedPost } from "@/lib/blog"

export const dynamic = "force-dynamic"

function formatDate(iso: string | null, locale: string) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return ""
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [{ dict, locale }, post] = await Promise.all([getServerI18n(), getPublishedPost(slug)])
  if (!post) notFound()
  const t = dict.blogPage

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 lg:px-8 lg:py-24">
      <Link href="/blog" className="text-sm font-semibold text-primary hover:underline">
        ← {t.backToBlog}
      </Link>

      <header className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t.published} · {formatDate(post.published_at, locale)}
          {post.author ? ` · ${post.author}` : ""}
        </p>
        <h1 className="mt-3 text-pretty text-3xl font-black tracking-tight lg:text-4xl">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>}
      </header>

      {post.cover_url && (
        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted">
          <Image src={post.cover_url || "/placeholder.svg"} alt={post.title} fill className="object-cover" priority />
        </div>
      )}

      <div className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">{post.body}</div>
    </article>
  )
}
