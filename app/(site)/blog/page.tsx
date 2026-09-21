import Link from "next/link"
import Image from "next/image"
import { getServerI18n } from "@/lib/i18n/server"
import { listPublishedPosts } from "@/lib/blog"

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

export default async function BlogIndexPage() {
  const [{ dict, locale }, posts] = await Promise.all([getServerI18n(), listPublishedPosts()])
  const t = dict.blogPage

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
      <header className="max-w-2xl">
        <h1 className="text-pretty text-4xl font-black tracking-tight lg:text-5xl">{t.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t.intro}</p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-16 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          {t.empty}
        </p>
      ) : (
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/50"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                {post.cover_url ? (
                  <Image
                    src={post.cover_url || "/placeholder.svg"}
                    alt={post.title}
                    fill
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl font-black text-muted-foreground/40">
                    SHWUR<span className="text-primary/40">X</span>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatDate(post.published_at, locale)}
                </p>
                <h2 className="mt-2 text-lg font-bold leading-snug text-foreground">{post.title}</h2>
                {post.excerpt && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                )}
                <span className="mt-4 text-sm font-semibold text-primary">{t.readMore} →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
