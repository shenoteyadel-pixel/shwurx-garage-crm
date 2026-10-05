import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

process.env.SITE_LOCALE_SECRET = "test-only-secret"
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const load = () => import("../proxy")

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost:4317"), { headers })
}

const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`)

test("direct /ar request resolves Arabic regardless of a stored English cookie", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/ar/brands/porsche", { cookie: "shwurx_lang=en" }))
  assert.match(res.headers.get("x-middleware-rewrite") ?? "", /\/brands\/porsche$/)
  assert.equal(forwarded(res, "x-site-locale"), "ar")
  assert.equal(forwarded(res, "x-site-path"), "/ar/brands/porsche")
  assert.ok(forwarded(res, "x-site-locale-proof"))
})

test("direct English request resolves English regardless of a stored Arabic cookie", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/brands/porsche", { cookie: "shwurx_lang=ar" }))
  assert.equal(forwarded(res, "x-site-locale"), "en")
  assert.equal(forwarded(res, "x-site-path"), "/brands/porsche")
})

test("a rewrite that re-enters the proxy as the unprefixed path keeps Arabic", async () => {
  const { proxy } = await load()
  const first = await proxy(req("/ar/brands/porsche"))
  const carried: Record<string, string> = {}
  for (const h of ["x-site-locale", "x-site-path", "x-site-locale-proof"]) carried[h] = forwarded(first, h)!
  const second = await proxy(req("/brands/porsche", carried))
  assert.equal(forwarded(second, "x-site-locale"), "ar")
  assert.equal(forwarded(second, "x-site-path"), "/ar/brands/porsche")
})

test("forged or replayed locale headers cannot switch an English URL to Arabic", async () => {
  const { proxy } = await load()
  const forged = await proxy(req("/brands/porsche", { "x-site-locale": "ar", "x-site-path": "/ar/brands/porsche", "x-site-locale-proof": "bogus" }))
  assert.equal(forwarded(forged, "x-site-locale"), "en")

  const first = await proxy(req("/ar/brands/porsche"))
  const replay = await proxy(
    req("/services", {
      "x-site-locale": "ar",
      "x-site-path": forwarded(first, "x-site-path")!,
      "x-site-locale-proof": forwarded(first, "x-site-locale-proof")!,
    }),
  )
  assert.equal(forwarded(replay, "x-site-locale"), "en", "a proof is bound to its target path")
})

test("CRM requests drop client-sent site locale headers so the cookie language applies", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/auth/login", { "x-site-locale": "ar", cookie: "shwurx_lang=en" }))
  assert.equal(forwarded(res, "x-site-locale"), "")
  assert.match(res.headers.get("x-middleware-override-headers") ?? "", /cookie/)
})
