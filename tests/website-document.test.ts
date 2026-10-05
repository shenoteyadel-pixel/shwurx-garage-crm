import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeDocument, parseDocument, safeUrl, safeMediaUrl, validateDocument } from "../lib/website/normalize"
import { seedDocument } from "../lib/website/seed"
import type { CustomPage, WebsiteDocument } from "../lib/website/types"

const L = (en: string, ar = "") => ({ en, ar })

function withCustom(pages: unknown[]): unknown {
  const doc = structuredClone(seedDocument()) as unknown as Record<string, unknown>
  ;(doc.pages as Record<string, unknown>).custom = pages
  return doc
}

const page: CustomPage = {
  id: "p1",
  slug: "winter-check",
  template: "landing",
  title: L("Winter check", "فحص الشتاء"),
  intro: L("Intro", "مقدمة"),
  visible: true,
  seo: { title: L("t", "t"), description: L("d", "d"), ogImageId: null, noindex: false },
  brandSlug: "porsche",
  serviceSlug: null,
  blocks: [
    { id: "b1", type: "text", heading: L("H", "ع"), body: L("Body", "نص") },
    { id: "b2", type: "faq", heading: L("FAQ"), faqs: [{ id: "f1", q: L("Q?", "س؟"), a: L("A", "ج") }] },
    { id: "b3", type: "gallery", heading: L("Photos"), mediaIds: ["logo"] },
    { id: "b4", type: "cta", heading: L("Call"), body: L("Book") },
  ],
}

test("every custom block variant survives a save/load round-trip", () => {
  const first = parseDocument(withCustom([page]))
  assert.equal(first.ok, true, JSON.stringify(!first.ok && first.issues))
  if (!first.ok) return
  // Simulate persistence: JSON out, JSON in, parse again.
  const reloaded = parseDocument(JSON.parse(JSON.stringify(first.doc)))
  assert.equal(reloaded.ok, true)
  if (!reloaded.ok) return
  const got = reloaded.doc.pages.custom[0]
  assert.deepEqual(got, page)
  assert.deepEqual(got.blocks.map((b) => b.type), ["text", "faq", "gallery", "cta"])
})

test("unknown block types and foreign fields are reported, not kept", () => {
  const bad = { ...page, blocks: [{ id: "x", type: "script", body: L("<x>") }, { ...page.blocks[0], mediaIds: ["a"] }] }
  const res = parseDocument(withCustom([bad]))
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.ok(res.issues.some((i) => i.message.includes("block type must be one of")))
  const shaped = normalizeDocument(withCustom([bad]))
  assert.equal(shaped.pages.custom[0].blocks.length, 1)
  assert.equal("mediaIds" in shaped.pages.custom[0].blocks[0], false)
})

test("null items in seed-empty arrays are rejected instead of crashing", () => {
  const res = parseDocument(withCustom([null]))
  assert.equal(res.ok, false)
  const doc = structuredClone(seedDocument()) as unknown as WebsiteDocument
  ;(doc.brands[0] as unknown as { caseStudies: unknown[] }).caseStudies = [null]
  const res2 = parseDocument(doc)
  assert.equal(res2.ok, false)
  assert.doesNotThrow(() => validateDocument(normalizeDocument(doc)))
  assert.doesNotThrow(() => validateDocument(normalizeDocument(withCustom([null]))))
})

test("invalid enums and nullable slugs are coerced safely", () => {
  const res = parseDocument(withCustom([{ ...page, template: "evil", brandSlug: "../crm" }]))
  assert.equal(res.ok, false)
  const shaped = normalizeDocument(withCustom([{ ...page, template: "evil", brandSlug: "../crm" }]))
  assert.equal(shaped.pages.custom[0].template, "standard")
  assert.equal(shaped.pages.custom[0].brandSlug, null)
})

test("the seed document parses cleanly with every media source and logo", () => {
  const seed = seedDocument()
  const res = parseDocument(seed)
  assert.equal(res.ok, true, JSON.stringify(!res.ok && res.issues))
  if (!res.ok) return
  const sources = new Set(res.doc.media.map((m) => m.source))
  assert.ok(sources.has("brand_mark"))
  const logos = res.doc.media.filter((m) => m.id.startsWith("logo-"))
  assert.equal(logos.length, seed.media.filter((m) => m.id.startsWith("logo-")).length)
  assert.equal(logos.length, 11)
})

test("explicit null logoId never inherits another brand's logo", () => {
  const seed = seedDocument()
  const nulls = ["lotus", "bugatti", "chevrolet-corvette", "gmc"]
  for (const slug of nulls) {
    const b = seed.brands.find((x) => x.slug === slug)
    assert.ok(b, `seed has ${slug}`)
    assert.equal(b!.logoId, null)
  }
  const shaped = normalizeDocument(JSON.parse(JSON.stringify(seed)))
  for (const slug of nulls) assert.equal(shaped.brands.find((x) => x.slug === slug)!.logoId, null, slug)
  assert.equal(shaped.brands.find((x) => x.slug === "porsche")!.logoId, "logo-porsche")
})

test("normalization preserves seed content and is idempotent", () => {
  const seed = seedDocument()
  const once = normalizeDocument(JSON.parse(JSON.stringify(seed)))
  assert.deepEqual(once, seed)
  const twice = normalizeDocument(JSON.parse(JSON.stringify(once)))
  assert.deepEqual(twice, once)
})

test("non-object documents are rejected", () => {
  for (const v of [null, 1, "x", []]) assert.equal(parseDocument(v).ok, false)
})

test("safeUrl rejects disguised external origins; internal/tel/mailto/explicit https allowed", () => {
  for (const bad of [
    "/\\evil.example/path",
    "\\\\evil.example",
    "//evil.example",
    "/%2F/evil.example",
    "javascript:alert(1)",
    "http://evil.example",
    "/ok\u0000",
    "data:text/html,x",
  ]) {
    assert.equal(safeUrl(bad), "", `should reject ${JSON.stringify(bad)}`)
  }
  for (const good of ["/brands/porsche", "/contact#enquire", "tel:+97143000000", "mailto:info@swurxauto.com"]) {
    assert.equal(safeUrl(good), good)
  }
  // Explicit https links (e.g. a map link) are intentionally external and visible as such.
  assert.equal(safeUrl("https://maps.google.com/?q=x"), "https://maps.google.com/?q=x")
})

test("safeMediaUrl only allows site paths and https", () => {
  assert.equal(safeMediaUrl("/images/a.jpg"), "/images/a.jpg")
  assert.equal(safeMediaUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg")
  assert.equal(safeMediaUrl("http://cdn.example/a.jpg"), "")
  assert.equal(safeMediaUrl("/\\evil.example/a.jpg"), "")
})
