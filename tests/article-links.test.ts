import { test } from "node:test"
import assert from "node:assert/strict"
import { isArticleHrefAvailable } from "../lib/article-links"
import { parseInline } from "../lib/safe-markdown"

const SITE = "https://www.swurxauto.com"

test("partial publication keeps ready paths and removes unavailable article links in each locale", () => {
  for (const prefix of ["", "/ar"]) {
    const live = `${prefix}/blog/porsche-live`
    const available = new Set([live])
    assert.equal(isArticleHrefAvailable(live, available, SITE), true)
    assert.equal(isArticleHrefAvailable(`${live}?source=article#scope`, available, SITE), true)
    assert.equal(isArticleHrefAvailable(`${live}/#scope`, available, SITE), true)
    assert.equal(isArticleHrefAvailable(`${SITE}${live}#scope`, available, SITE), true)
    assert.equal(isArticleHrefAvailable(`${prefix}/blog/porsche-draft`, available, SITE), false)
    assert.equal(isArticleHrefAvailable(`${prefix}/blog/porsche-unready?from=body`, available, SITE), false)
    assert.equal(isArticleHrefAvailable(`${SITE}${prefix}/blog/missing#scope`, available, SITE), false)
  }
})

test("an English published path cannot make the Arabic article link available", () => {
  assert.equal(isArticleHrefAvailable("/ar/blog/porsche-live", new Set(["/blog/porsche-live"]), SITE), false)
})

test("article availability does not change brand, service, directory, manufacturer or page-anchor links", () => {
  const available = new Set<string>()
  for (const href of ["/brands/porsche", "/ar/services/diagnostics", "/blog?brand=porsche", "/ar/blog", "https://www.porsche.com/blog/model", "#scope"]) {
    assert.equal(isArticleHrefAvailable(href, available, SITE), true, href)
  }
})

test("unsafe URLs are still removed by the Markdown parser before the availability check", () => {
  for (const href of ["javascript:alert%281%29", "data:text/html;base64,PHNjcmlwdD4=", "//attacker.invalid/blog/test"]) {
    assert.ok(parseInline(`[Read](${href})`).every(item => item.type === "text"), href)
  }
})
