import { test } from "node:test"
import assert from "node:assert/strict"
import { emptyCopy, rowToArticle } from "@/lib/article-model"
import { articleToDoc, draftRowToArticle, publicSnapshot, withPublishedSnapshot } from "@/lib/article-drafts"
import { buildInventory } from "@/lib/website/inventory"
import { seedDocument } from "@/lib/website/seed"

const copy = (title: string) => ({
  ...emptyCopy(), title, excerpt: title + " excerpt", body: "Useful article text. ".repeat(40),
  seoDescription: title + " description", ready: true,
})

function fixture() {
  const draft = draftRowToArticle({
    id: "private-id", article_key: "topic-1", slug: "new-draft-slug", brand_slug: "audi",
    workflow: "approved", revision: 5, published_revision: 3,
    first_published_at: "2026-10-05T10:00:00Z", updated_at: "2026-10-05T11:00:00Z",
    doc: { content: { en: copy("Pending English title"), ar: emptyCopy() } },
  })
  const live = rowToArticle({
    id: "public-id", article_key: "topic-1", slug: "old-live-slug", brand_slug: "porsche",
    status: "published", revision: 3, published_at: "2026-10-05T10:00:00Z",
    content: { en: emptyCopy(), ar: copy("العنوان المنشور") },
  })
  return withPublishedSnapshot(draft, live)
}

test("private article retains draft copy separately from the actual live locale and route", () => {
  const article = fixture()
  assert.equal(article.content.en.title, "Pending English title")
  assert.equal(article.slug, "new-draft-slug")
  assert.equal(article.draftAhead, true)
  assert.deepEqual(article.published?.locales, ["ar"])
  assert.equal(article.published?.slug, "old-live-slug")
  assert.equal(article.published?.brandSlug, "porsche")
  assert.equal(article.published?.title.ar, "العنوان المنشور")
  assert.equal(article.published?.revision, 3)
  assert.equal("published" in articleToDoc(article), false)
  assert.equal("draftAhead" in articleToDoc(article), false)
  assert.equal("published" in publicSnapshot(article), false)
})

test("Overview keeps the live article identity and flags its saved draft changes", () => {
  const article = fixture()
  const doc = seedDocument()
  const post = buildInventory(doc, doc, [{
    id: article.id, slug: article.slug, title: article.content.en.title,
    titleAr: article.content.ar.title, status: article.status, excerpt: article.content.en.excerpt,
    coverUrl: article.coverUrl, complete: { en: true, ar: false },
    published: article.published, draftAhead: article.draftAhead,
  }]).find((item) => item.key === "post:private-id")
  assert.ok(post)
  assert.equal(post.status, "published")
  assert.equal(post.changed, true)
  assert.equal(post.path, "/blog/old-live-slug")
  assert.deepEqual(post.title, { en: "", ar: "العنوان المنشور" })
  assert.deepEqual(post.complete, { en: false, ar: true })
  assert.deepEqual(post.edit, { kind: "blog", postId: "private-id" })
})

test("unpublished and missing-snapshot articles do not claim their draft languages are live", () => {
  const doc = seedDocument()
  const post = {
    id: "private-id", slug: "draft-only", title: "Draft", titleAr: "", excerpt: "Draft excerpt",
    coverUrl: null, complete: { en: true, ar: false }, published: null,
  }
  const item = (status: string) => buildInventory(doc, doc, [{ ...post, status }])
    .find((row) => row.key === "post:private-id")!
  assert.deepEqual(item("draft").complete, { en: true, ar: false })
  assert.deepEqual(item("published").complete, { en: false, ar: false })
  assert.ok(item("published").flags.includes("Live snapshot metadata unavailable"))
})
