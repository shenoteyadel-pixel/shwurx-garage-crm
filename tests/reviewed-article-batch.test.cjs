// Run: node --test tests/reviewed-article-batch.test.cjs
// Executes the actual TypeScript server action. Auth/framework and the RPC boundary
// are synthetic spies; this does not claim a new native PostgreSQL or browser test.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { createHash } = require("node:crypto")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const root = path.resolve(__dirname, "..")
const clone = (x) => JSON.parse(JSON.stringify(x))

function harness({ denied = false, preview = false, changedPackage = false } = {}) {
  const cache = new Map(), rows = new Map(), posts = new Map(), rpcCalls = [], audit = [], invalidations = []
  let dbReads = 0, clientCalls = 0, beforeRpc = null, publishErrorKey = null
  const ui = {}
  for (const [name, tag] of Object.entries({ Card: "div", Button: "button", Input: "input", Label: "label", Textarea: "textarea", Badge: "span" })) {
    ui[name] = ({ children, variant, ...props }) => React.createElement(tag, props, children)
  }
  const svc = {
    from(table) {
      assert(["article_drafts", "blog_posts"].includes(table))
      const filters = []
      return {
        select() { return this }, eq(k, v) { filters.push([k, v]); return this },
        async maybeSingle() {
          dbReads++
          const data = [...(table === "article_drafts" ? rows : posts).values()].find((r) => filters.every(([k, v]) => r[k] === v))
          return { data: data ? clone(data) : null, error: null }
        },
      }
    },
    async rpc(name, args) {
      assert(["article_save", "article_publish"].includes(name), "Batch must use approved lifecycle RPCs only")
      rpcCalls.push({ name, args: clone(args) })
      if (beforeRpc) beforeRpc(name, args)
      const row = rows.get(args.p_id)
      assert(row, "Batch cannot create or replace missing drafts")
      if (args.p_expected_revision !== row.revision) return { data: null, error: { code: "40001", message: "stale" } }
      if (name === "article_save") {
        assert.equal(args.p_action, "approve")
        row.doc = clone(args.p_doc); row.workflow = args.p_workflow; row.revision++
      } else {
        if (row.article_key === publishErrorKey) return { data: null, error: { code: "P0001", message: "Synthetic publication failure" } }
        assert.equal(row.workflow, "approved")
        row.revision++; row.published_revision = row.revision; row.first_published_at = "2026-10-05T12:00:00Z"
        posts.set(row.article_key, { ...clone(args.p_post), id: "live-" + row.id, status: "published", workflow: "approved", revision: row.revision, published_at: row.first_published_at })
      }
      return { data: clone(row), error: null }
    },
  }
  const stubs = {
    "server-only": {},
    "next/cache": { revalidatePath: (p) => invalidations.push(p) },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/image": ({ fill, priority, ...p }) => React.createElement("img", p),
    "@/lib/supabase/server": { createServiceClient() { clientCalls++; return svc } },
    "@/lib/rbac/context": {
      async requirePermission(p) { assert.equal(p, "website.manage"); if (denied) throw Error("DENIED"); return { name: "Synthetic authorized reviewer" } },
      async logAction(...args) { audit.push(args) },
    },
    "@/lib/website/env": { canMutateCms: () => !preview, PREVIEW_MUTATION_MESSAGE: "PREVIEW_READ_ONLY" },
    "@/components/ui": ui,
    "@/lib/actions-website": { async uploadWebsiteImage() { throw Error("No uploads in this test") } },
  }
  function load(file) {
    const full = path.join(root, file)
    if (cache.has(full)) return cache.get(full).exports
    const m = new Module(full); m.filename = full; m.paths = Module._nodeModulePaths(root); cache.set(full, m)
    m.require = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      if (name.startsWith("@/") || name.startsWith(".")) {
        const f = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(full), name))
        if (f.endsWith(".json")) {
          const data = JSON.parse(fs.readFileSync(path.join(root, f), "utf8"))
          if (changedPackage && f === "data/editorial/articles-75.json") data[0].body.en += " Unreviewed change"
          return data
        }
        return load([".ts", ".tsx"].map((e) => f + e).find((p) => fs.existsSync(path.join(root, p))))
      }
      return require(name)
    }
    m._compile(ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, full)
    return m.exports
  }
  const drafts = load("lib/article-drafts.ts"), model = load("lib/article-model.ts"), batch = load("lib/article-batch.ts"), actions = load("lib/actions-articles.ts")
  const reviewed = () => load("lib/reviewed-article-package.ts").reviewedArticlePackage()
  function seed(brand = "porsche") {
    for (const a of reviewed().filter((a) => a.brandSlug === brand)) {
      const id = "draft-" + a.key
      rows.set(id, { id, article_key: a.key, slug: a.slug, brand_slug: a.brandSlug, workflow: a.workflow, doc: { ...drafts.articleToDoc(a), author: "Original private author", brief: { private: "PRIVATE_BRIEF_SENTINEL" } }, revision: 7, published_revision: null, first_published_at: null, updated_at: "2026-10-05T11:00:00Z" })
    }
  }
  function versions() { return [...rows.values()].map((r) => ({ key: r.article_key, id: r.id, revision: r.revision })) }
  function articles() { return [...rows.values()].map((r) => drafts.withPublishedSnapshot(drafts.draftRowToArticle(r), posts.has(r.article_key) ? model.rowToArticle(posts.get(r.article_key)) : null)) }
  return { load, actions, batch, reviewed, seed, versions, articles, rows, posts, rpcCalls, audit, invalidations,
    get dbReads() { return dbReads }, get clientCalls() { return clientCalls },
    set beforeRpc(f) { beforeRpc = f }, set publishErrorKey(k) { publishErrorKey = k } }
}

test("permission and preview guards reject the batch before private reads or writes", async () => {
  for (const option of [{ denied: true }, { preview: true }]) {
    const h = harness(option)
    await assert.rejects(() => h.actions.publishReviewedArticleBrand("porsche", []), /DENIED|PREVIEW_READ_ONLY/)
    assert.equal(h.clientCalls, 0); assert.equal(h.dbReads, 0); assert.equal(h.rpcCalls.length, 0)
  }
})

test("review digest pins all 75 normalized articles and covers; changed content cannot acquire blanket approval", async () => {
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, "data/editorial/articles-75.json"))).digest("hex"), "57efa03656bdf42adb3b9d136750929afd67f5fd27e46f46801956bfd9caa992")
  const h = harness(); assert.equal(h.reviewed().length, 75)
  for (const brand of h.batch.REVIEWED_ARTICLE_BRANDS) assert.equal(h.reviewed().filter((a) => a.brandSlug === brand).length, 5)
  const changed = harness({ changedPackage: true })
  assert.equal((await changed.actions.publishReviewedArticleBrand("porsche", [])).ok, false)
  assert.equal(changed.clientCalls, 0)
})

test("invalid brand, oversized, duplicate and foreign-key requests do not read private rows", async () => {
  const h = harness(), v = { key: "porsche-01", id: "draft-porsche-01", revision: 7 }
  for (const [brand, versions] of [["unknown", []], ["porsche", Array(6).fill(v)], ["porsche", [v, v]], ["porsche", [{ ...v, key: "ferrari-01" }]], ["porsche", [{ ...v, revision: null }]]]) {
    assert.equal((await h.actions.publishReviewedArticleBrand(brand, versions)).ok, false)
  }
  assert.equal(h.clientCalls, 0)
})

test("five exact drafts publish both locales using stored guarded snapshots and trusted reviewer; retry writes nothing", async () => {
  const h = harness(); h.seed(); const loaded = h.versions()
  const result = await h.actions.publishReviewedArticleBrand("porsche", loaded)
  assert.equal(result.ok, true); assert.equal(result.items.length, 5)
  assert(result.items.every((i) => i.outcome === "published" && i.revision === 9))
  assert.equal(h.posts.size, 5); assert.equal(h.rpcCalls.length, 10)
  for (const post of h.posts.values()) {
    assert.equal(post.content.en.ready, true); assert.equal(post.content.ar.ready, true)
    assert.equal(post.author, "SHWURX Auto Service Center"); assert.equal(post.reviewed_by, null)
    assert(!JSON.stringify(post).includes("PRIVATE_BRIEF_SENTINEL")); assert(!JSON.stringify(post).includes("Original private author"))
  }
  for (const row of h.rows.values()) {
    assert.equal(row.doc.reviewed_by, "Synthetic authorized reviewer")
    assert.equal(row.doc.author, "Original private author")
  }
  assert(h.invalidations.includes("/sitemap.xml")); assert.equal(h.audit.length, 10)
  const before = clone([...h.rows.values()])
  const retry = await h.actions.publishReviewedArticleBrand("porsche", loaded)
  assert(retry.items.every((i) => i.outcome === "already_live")); assert.equal(h.rpcCalls.length, 10)
  assert.deepEqual([...h.rows.values()], before)
})

test("all reviewed fields reject owner edits while review metadata/readiness and JSON key ordering do not", () => {
  const h = harness(), a = h.reviewed()[0], fp = h.batch.reviewedPackageFingerprint
  for (const edit of [
    (x) => { x.slug += "-edited" }, (x) => { x.content.ar.body += " تعديل" },
    (x) => { x.content.en.seoTitle += " edited" }, (x) => { x.sources[0].supports += " changed" },
    (x) => { x.brandSlug = "ferrari" }, (x) => { x.serviceSlugs = [] }, (x) => { x.relatedKeys = [] },
    (x) => { x.coverUrl = "/owner.webp" }, (x) => { x.coverIllustrative = false },
    (x) => { x.content.ar.coverAlt += " تعديل" },
    (x) => { x.content.en.coverAlt += " edited" }, (x) => { x.content.ar.coverCaption += " تعديل" },
    (x) => { x.content.en.coverCaption += " edited" },
  ]) { const changed = clone(a); edit(changed); assert.notEqual(fp(changed), fp(a)) }
  const reordered = clone(a)
  reordered.content.en = Object.fromEntries(Object.entries(reordered.content.en).reverse())
  reordered.sources = reordered.sources.map((s) => Object.fromEntries(Object.entries(s).reverse()))
  reordered.content.en.ready = true; reordered.reviewedBy = "Other reviewer"; reordered.reviewedAt = "later"; reordered.author = "other"; reordered.revision = 100
  assert.equal(fp(reordered), fp(a))
  const multipleSources = h.reviewed().find((article) => article.sources.length > 1)
  assert(multipleSources)
  const reversedSources = clone(multipleSources); reversedSources.sources.reverse()
  assert.notEqual(fp(reversedSources), fp(multipleSources), "Source array order is part of the exact reviewed package")
})

test("edited cover captions and reordered sources are not automatically approved", async () => {
  const h = harness(); h.seed()
  h.rows.get("draft-porsche-01").doc.content.ar.coverCaption = "Owner's caption"
  const row = [...h.rows.values()].find((r) => r.article_key !== "porsche-01" && r.doc.sources.length > 1)
  assert(row); row.doc.sources.reverse()
  const result = await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  assert.equal(result.items.find((i) => i.key === "porsche-01").outcome, "edited")
  assert.equal(result.items.find((i) => i.key === row.article_key).outcome, "edited")
  assert.equal(h.posts.has(row.article_key), false); assert.equal(h.posts.has("porsche-01"), false)
})

test("edited and missing drafts are skipped without overwrite; stale loaded revision conflicts while other items complete", async () => {
  const h = harness(); h.seed(); const versions = h.versions()
  h.rows.get("draft-porsche-01").doc.content.en.title = "Owner's exact title"
  h.rows.delete("draft-porsche-02"); h.rows.get("draft-porsche-03").revision++
  const result = await h.actions.publishReviewedArticleBrand("porsche", versions)
  assert.deepEqual(result.items.map((i) => i.outcome), ["edited", "missing", "conflict", "published", "published"])
  assert.equal(h.rows.get("draft-porsche-01").doc.content.en.title, "Owner's exact title")
  assert.equal(h.rows.get("draft-porsche-01").revision, 7)
  assert.equal(h.rpcCalls.length, 4); assert.equal(h.posts.size, 2)
})

test("CAS race after read fails safely without replacing concurrent private content", async () => {
  const h = harness(); h.seed()
  h.beforeRpc = (name, args) => {
    if (name === "article_save" && args.p_id === "draft-porsche-01") {
      const row = h.rows.get(args.p_id); row.revision++; row.doc.content.ar.body += " CONCURRENT_OWNER_CHANGE"
    }
  }
  const result = await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  assert.equal(result.items[0].outcome, "conflict"); assert.equal(h.posts.has("porsche-01"), false)
  assert(h.rows.get("draft-porsche-01").doc.content.ar.body.endsWith("CONCURRENT_OWNER_CHANGE"))
})

test("publish failure leaves that approved draft private, reports partial completion and permits safe retry", async () => {
  const h = harness(); h.seed(); h.publishErrorKey = "porsche-01"
  const result = await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  assert.equal(result.ok, false); assert.equal(result.items[0].outcome, "failed"); assert.equal(h.posts.size, 4)
  const first = h.rows.get("draft-porsche-01")
  assert.equal(first.workflow, "approved"); assert.equal(first.published_revision, null)
  h.publishErrorKey = null
  const retry = await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  assert.equal(retry.items[0].outcome, "published"); assert(retry.items.slice(1).every((i) => i.outcome === "already_live"))
  assert.equal(h.posts.size, 5)
})

test("a pending ready flag change is not misreported as already published", async () => {
  const h = harness(); h.seed(); await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  const row = h.rows.get("draft-porsche-01"); row.doc.content.ar.ready = false; row.revision++
  const result = await h.actions.publishReviewedArticleBrand("porsche", h.versions())
  assert.equal(result.items[0].outcome, "published"); assert.equal(h.posts.get("porsche-01").content.ar.ready, true)
})

test("batch UI is restricted to managers and counts only actual bilingual snapshots at the current revision", () => {
  const h = harness(); h.seed()
  const { ArticleManager } = h.load("components/website-builder/article-manager.tsx")
  const props = { posts: h.articles(), taxonomy: { brands: [{ slug: "porsche", name: "Porsche" }], services: [] } }
  const visible = renderToStaticMarkup(React.createElement(ArticleManager, { ...props, canManage: true }))
  assert(visible.includes("Review both languages and publish reviewed package"))
  assert(visible.includes("Current library: 0/5")); assert.equal((visible.match(/Saved revision 7/g) || []).length, 5)
  const hidden = renderToStaticMarkup(React.createElement(ArticleManager, { ...props, canManage: false }))
  assert(!hidden.includes("Publish reviewed articles by brand"))
})
