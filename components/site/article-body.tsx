import Link from "next/link"
import { parseMarkdown, type Inline } from "@/lib/safe-markdown"
import { isArticleHrefAvailable } from "@/lib/article-links"

type AvailableArticleLinks = {
  publishedArticleHrefs: ReadonlySet<string>
  siteUrl: string
}

function Inlines({ items, publishedArticleHrefs, siteUrl }: { items: Inline[] } & AvailableArticleLinks) {
  return (
    <>
      {items.map((x, i) =>
        x.type === "text" || !isArticleHrefAvailable(x.href, publishedArticleHrefs, siteUrl) ? (
          <span key={i}>{x.text}</span>
        ) : x.external ? (
          <a key={i} href={x.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline underline-offset-4">
            {x.text}
          </a>
        ) : (
          <Link key={i} href={x.href} className="font-medium text-primary underline underline-offset-4">
            {x.text}
          </Link>
        ),
      )}
    </>
  )
}

export function ArticleBody({ body, publishedArticleHrefs, siteUrl }: {
  body: string
  publishedArticleHrefs: readonly string[]
  siteUrl: string
}) {
  const available = new Set(publishedArticleHrefs)
  return (
    <div className="mt-10 flex flex-col gap-5 text-base leading-relaxed text-foreground/90">
      {parseMarkdown(body).map((b, i) => {
        if ("items" in b) {
          const List = b.type
          return (
            <List key={i} className={`flex flex-col gap-2 ps-6 ${b.type === "ul" ? "list-disc" : "list-decimal"}`}>
              {b.items.map((item, j) => (
                <li key={j} className="text-pretty">
                  <Inlines items={item} publishedArticleHrefs={available} siteUrl={siteUrl} />
                </li>
              ))}
            </List>
          )
        }
        if (b.type === "h2")
          return (
            <h2 key={i} className="mt-4 text-pretty text-2xl font-semibold text-foreground">
              <Inlines items={b.inlines} publishedArticleHrefs={available} siteUrl={siteUrl} />
            </h2>
          )
        if (b.type === "h3")
          return (
            <h3 key={i} className="mt-2 text-pretty text-xl font-semibold text-foreground">
              <Inlines items={b.inlines} publishedArticleHrefs={available} siteUrl={siteUrl} />
            </h3>
          )
        return (
          <p key={i} className="whitespace-pre-line text-pretty">
            <Inlines items={b.inlines} publishedArticleHrefs={available} siteUrl={siteUrl} />
          </p>
        )
      })}
    </div>
  )
}
