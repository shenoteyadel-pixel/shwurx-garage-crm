import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

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
})

test("direct English request resolves English regardless of a stored Arabic cookie", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/brands/porsche", { cookie: "shwurx_lang=ar" }))
  assert.equal(forwarded(res, "x-site-locale"), "en")
  assert.equal(forwarded(res, "x-site-path"), "/brands/porsche")
})

test("client-sent locale headers cannot switch an English URL to Arabic", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/brands/porsche", { "x-site-locale": "ar", "x-site-path": "/ar/brands/porsche" }))
  assert.equal(forwarded(res, "x-site-locale"), "en")
  assert.equal(forwarded(res, "x-site-path"), "/brands/porsche")
})

test("unknown /ar paths rewrite to not-found instead of exposing CRM routes", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/ar/crm/settings"))
  assert.match(res.headers.get("x-middleware-rewrite") ?? "", /\/pages\/__not-found$/)
})

test("CRM requests drop client-sent site locale headers so the cookie language applies", async () => {
  const { proxy } = await load()
  const res = await proxy(req("/auth/login", { "x-site-locale": "ar", cookie: "shwurx_lang=en" }))
  assert.equal(forwarded(res, "x-site-locale"), "")
  assert.match(res.headers.get("x-middleware-override-headers") ?? "", /cookie/)
})
