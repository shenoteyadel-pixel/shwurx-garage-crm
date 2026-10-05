// Executes the actual sitemap generator and Next XML serializer, with published-reader fixtures only.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const { resolveSitemap } = require("next/dist/build/webpack/loaders/metadata/resolve-route-data")
const root = path.resolve(__dirname, "..")
const ORIGIN = "https://www.swurxauto.com"
function compile(file, imports = {}) {
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", source)((name) => {
    assert(Object.hasOwn(imports, name), "Unexpected dependency/private reader: " + name)
    return imports[name]
  }, module, module.exports)
  return module.exports
}
const model = compile("lib/article-model.ts")
const brands = ["porsche", "bentley", "rolls-royce", "lamborghini", "mercedes-benz", "audi", "lotus", "mclaren", "aston-martin", "ferrari", "maserati", "bugatti", "chevrolet-corvette", "gmc", "range-rover"]
const services = ["mechanical-repair", "diagnostics", "bodywork", "painting", "online-programming", "offline-programming"]
const page = (slug, visible = true, noindex = false) => ({ slug, visible, seo: { noindex } })
const document = () => ({ brands: brands.map((b) => page(b)), services: services.map((s) => page(s)), pages: {
  home: page(""), brandsIndex: page("brands"), servicesIndex: page("services"), about: page("about"), contact: page("contact"), privacy: page("privacy"),
  team: page("team"), appointment: page("appointment", false), custom: [],
} })
function generator(doc, articles = []) {
  return compile("app/sitemap.ts", {
    "@/lib/website/store": { getPublishedDocument: async () => doc },
    "@/lib/website/normalize": { isTeamPagePublic: (d) => d.pages.team.visible },
    "@/lib/website/render": { SITE_URL: ORIGIN, localePath: (lang, p) => lang === "en" ? p : p === "/" ? "/ar" : `/ar${p}` },
    "@/lib/blog": { listPublishedArticles: async () => articles },
    "@/lib/article-model": model,
  }).default
}
function post(slug, locales, status = "published") {
  const copy = (lang) => ({ ...model.emptyCopy(), title: `Title ${lang}`, excerpt: "Specific helpful excerpt", body: "Useful reviewed information. ".repeat(40), seoDescription: "Specific search description", ready: locales.includes(lang) })
  return model.rowToArticle({ id: slug, article_key: slug, slug, status, workflow: "approved", content: { en: copy("en"), ar: copy("ar") }, updated_at: "2026-10-05T12:00:00Z" })
}

test("each of 29 public core/brand/service pages has explicit EN and AR loc plus reciprocal hreflang in real XML", async () => {
  const entries = await generator(document())()
  assert.equal(entries.length, 58)
  const urls = new Set(entries.map((e) => e.url)); assert.equal(urls.size, 58)
  for (const entry of entries) {
    assert(entry.url.startsWith(ORIGIN + "/"))
    assert(Object.values(entry.alternates.languages).includes(entry.url))
    for (const url of Object.values(entry.alternates.languages)) {
      assert(urls.has(url), "Every hreflang target needs its own sitemap entry: " + url)
      assert.deepEqual(entries.find((e) => e.url === url).alternates, entry.alternates)
    }
  }
  const xml = resolveSitemap(entries)
  assert.equal((xml.match(/<loc>/g) || []).length, 58)
  assert(xml.includes(`<loc>${ORIGIN}/ar</loc>`)); assert(xml.includes(`<loc>${ORIGIN}/ar/brands/porsche</loc>`))
  assert.equal((xml.match(/hreflang="ar"/g) || []).length, 58)
})

test("hidden/noindex brands, services, custom pages, Team and appointment never gain locale entries", async () => {
  const doc = document()
  doc.brands = [page("hidden-brand", false), page("noindex-brand", true, true)]
  doc.services = [page("hidden-service", false), page("noindex-service", true, true)]
  doc.pages.custom = [page("hidden-custom", false), page("noindex-custom", true, true)]
  doc.pages.team.visible = false
  doc.pages.appointment = page("appointment", true, true)
  const entries = await generator(doc)()
  assert.equal(entries.length, 14)
  assert(!entries.some((e) => /hidden|noindex|\/team|\/appointment|\/api\/|\/marketing|\/crm/.test(e.url)))
})

test("visible indexable appointment and custom pages are represented in both languages", async () => {
  const doc = document(); doc.pages.appointment.visible = true; doc.pages.custom = [page("owner-page")]
  const entries = await generator(doc)()
  for (const route of ["/appointment", "/ar/appointment", "/pages/owner-page", "/ar/pages/owner-page"]) assert(entries.some((e) => e.url === ORIGIN + route))
  assert.equal(entries.length, 62)
})

test("each CMS-controlled static page obeys its published noindex flag in both locales without hiding indexed children", async () => {
  const mapping = { home: "/", brandsIndex: "/brands", servicesIndex: "/services", about: "/about", contact: "/contact", privacy: "/privacy" }
  for (const [key, route] of Object.entries(mapping)) {
    const doc = document(); doc.pages[key].seo.noindex = true
    const entries = await generator(doc)(), urls = entries.map((e) => e.url)
    assert.equal(entries.length, 56)
    assert(!urls.includes(ORIGIN + route))
    assert(!urls.includes(ORIGIN + (route === "/" ? "/ar" : "/ar" + route)))
    assert(urls.includes(ORIGIN + "/brands/porsche")); assert(urls.includes(ORIGIN + "/ar/services/painting"))
    const xml = resolveSitemap(entries)
    assert(!xml.includes(`<loc>${ORIGIN + route}</loc>`))
    assert(!xml.includes(`href="${ORIGIN + route}"`))
  }
})

test("article entries remain restricted to actual published ready locales without fabricated alternates or drafts", async () => {
  const entries = await generator(document(), [post("both-languages", ["en", "ar"]), post("english-only", ["en"]), post("arabic-only", ["ar"]), post("not-ready", []), post("private-draft", ["en", "ar"], "draft")])()
  const articles = entries.filter((e) => e.url.includes("/blog/"))
  assert.deepEqual(articles.map((a) => a.url), [`${ORIGIN}/blog/both-languages`, `${ORIGIN}/ar/blog/both-languages`, `${ORIGIN}/blog/english-only`, `${ORIGIN}/ar/blog/arabic-only`])
  assert.deepEqual(articles[0].alternates, articles[1].alternates)
  assert.equal(articles[2].alternates, undefined); assert.equal(articles[3].alternates, undefined)
  assert(!resolveSitemap(entries).includes("private-draft")); assert(!resolveSitemap(entries).includes("not-ready"))
})
