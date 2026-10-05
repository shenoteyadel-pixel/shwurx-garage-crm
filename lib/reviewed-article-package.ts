import "server-only"
import { createHash } from "node:crypto"
import { editorialToArticle, type DefaultCover, type EditorialArticle } from "@/lib/article-model"
import { reviewedPackageFingerprint } from "@/lib/article-batch"
import editorial from "@/data/editorial/articles-75.json"
import brandHeroes from "@/data/editorial/brand-heroes-v2.json"

// Reviewed source artifact SHA256: 57efa03656bdf42adb3b9d136750929afd67f5fd27e46f46801956bfd9caa992.
// This second digest pins the actual normalized review inputs, including their default covers.
const REVIEWED_INPUT_SHA256 = "06d99d6f15f978487998e9073fc2bba69ff7ef400eea673ccdef84cdbbf59837"

export function reviewedArticlePackage() {
  const items = editorial as unknown as EditorialArticle[]
  const slugToKey = new Map(items.map((e) => [e.slug, e.id]))
  const covers = new Map<string, DefaultCover>(brandHeroes.map((h) => [h.brandSlug, { url: h.url, alt: h.alt, caption: h.caption }]))
  const articles = items.map((e) => editorialToArticle(e, slugToKey, covers.get(e.brandSlug) ?? null, null))
  const digest = createHash("sha256").update(JSON.stringify(articles.map(reviewedPackageFingerprint))).digest("hex")
  if (digest !== REVIEWED_INPUT_SHA256) throw new Error("The editorial package has changed since its review. Review the new package before batch publication.")
  return articles
}
