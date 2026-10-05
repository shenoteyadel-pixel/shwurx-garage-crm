import { test } from "node:test"
import assert from "node:assert/strict"
import { buildInventory } from "../lib/website/inventory"
import { seedDocument } from "../lib/website/seed"

test("inventory lists core pages, brands and services with edit targets", () => {
  const doc = seedDocument()
  const items = buildInventory(doc, doc, [])
  const home = items.find((i) => i.key === "page:home")
  assert.ok(home)
  assert.equal(home.path, "/")
  assert.deepEqual(home.edit, { kind: "builder", section: "pages", recordId: "home" })
  assert.equal(home.changed, false)
  for (const b of doc.brands) {
    const row = items.find((i) => i.type === "brand" && i.edit.kind === "builder" && i.edit.recordId === b.id)
    assert.ok(row, `brand ${b.id} listed`)
  }
  for (const s of doc.services) {
    assert.ok(items.some((i) => i.type === "service" && i.edit.kind === "builder" && i.edit.recordId === s.id))
  }
})

test("inventory marks everything draft before first publish and flags edits after", () => {
  const doc = seedDocument()
  assert.ok(buildInventory(doc, null, []).filter((i) => i.type === "core").every((i) => i.status === "draft"))

  const edited = structuredClone(doc)
  edited.pages.about.title = { en: "Changed", ar: "" }
  const about = buildInventory(edited, doc, []).find((i) => i.key === "page:about")
  assert.ok(about)
  assert.equal(about.changed, true)
  assert.equal(about.complete.ar, false)
  assert.ok(about.flags.some((f) => f.includes("Arabic")))
})

test("inventory includes blog posts that deep-link to the post editor", () => {
  const doc = seedDocument()
  const items = buildInventory(doc, doc, [
    { id: "p1", slug: "hello", title: "Hello", status: "published", excerpt: null, coverUrl: null },
  ])
  const post = items.find((i) => i.type === "blog" && i.edit.kind === "blog" && i.edit.postId === "p1")
  assert.ok(post)
  assert.equal(post.path, "/blog/hello")
})

test("appointment row is never Hidden: the booking form is always public and not driven by the enquiry form", () => {
  const doc = seedDocument()
  doc.forms.enquiry.enabled = false
  for (const live of [doc, null]) {
    const row = buildInventory(doc, live, []).find((i) => i.key === "page:appointment")
    assert.ok(row)
    assert.equal(row.status, "published")
    assert.equal(row.edit.kind, "none")
  }
})
