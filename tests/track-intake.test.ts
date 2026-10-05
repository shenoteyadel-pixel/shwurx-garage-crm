import { test } from "node:test"
import assert from "node:assert/strict"
import { parseTrackBody, normalizePublicPath, originOnly } from "../lib/website/track-intake"

const UA = "Mozilla/5.0"

test("unknown or missing event types are rejected", () => {
  assert.deepEqual(parseTrackBody({ eventType: "drop_table", pagePath: "/" }, UA), { ok: false, error: "unknown_event" })
  assert.deepEqual(parseTrackBody({ pagePath: "/" }, UA), { ok: false, error: "unknown_event" })
  assert.equal(parseTrackBody({ eventType: "cta-click", pagePath: "/" }, UA).ok, true, "legacy hyphen form maps to the allowlist")
})

test("page path is mandatory, public and stripped of query and hash", () => {
  assert.deepEqual(parseTrackBody({ eventType: "page_view" }, UA), { ok: false, error: "non_public_path" })
  assert.deepEqual(parseTrackBody({ eventType: "page_view", pagePath: "" }, UA), { ok: false, error: "non_public_path" })
  assert.equal(normalizePublicPath("/dashboard"), null)
  assert.equal(normalizePublicPath("/q/abc123"), null)
  assert.equal(normalizePublicPath("//evil.com/x"), null)
  assert.equal(normalizePublicPath("/services/../dashboard"), null)
  assert.equal(normalizePublicPath("/services/?email=a@b.c#x"), "/services")
  assert.equal(normalizePublicPath("https://www.swurxauto.com/ar/about?gclid=1"), "/ar/about")
})

test("referrer keeps only the origin; campaigns and metadata are bounded", () => {
  assert.equal(originOnly("https://google.com/search?q=my+phone+0501234567"), "https://google.com")
  assert.equal(originOnly("javascript:alert(1)"), null)
  const r = parseTrackBody(
    {
      eventType: "page_view",
      pagePath: "/contact?name=x",
      referrer: "https://news.example/a/b?token=secret",
      campaign: "x".repeat(500),
      sessionId: "not a session id!",
      device: "fridge",
      metadata: { placement: "hero", email: "a@b.c", brand_slug: "<script>", nested: { a: 1 } },
    },
    "iPhone Mobile",
  )
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.record.pagePath, "/contact")
  assert.equal(r.record.referrer, "https://news.example")
  assert.equal(r.record.campaign?.length, 100)
  assert.equal(r.record.sessionId, null)
  assert.equal(r.record.device, "mobile")
  assert.deepEqual(r.record.metadata, { placement: "hero" })
})

test("encoded query/hash delimiters are stripped after decoding; contact-shaped paths rejected", () => {
  assert.equal(normalizePublicPath("/services/%3Femail%3Dsynthetic%40example.test"), "/services")
  assert.equal(normalizePublicPath("/services%23phone%3D0501234567"), "/services")
  assert.equal(normalizePublicPath("/services/%3F"), "/services")
  assert.equal(normalizePublicPath("/brands/synthetic%40example.test"), null)
  assert.equal(normalizePublicPath("/brands/0501234567"), null)
})

test("campaign fields drop email/phone/URL-shaped values but keep real campaign names", () => {
  const p = (v: Record<string, string>) => {
    const r = parseTrackBody({ eventType: "page_view", pagePath: "/", ...v }, "x")
    assert.ok(r.ok)
    return r.record
  }
  const bad = p({ source: "synthetic@example.test", medium: "+971 50 123 4567", campaign: "https://evil.example/x" })
  assert.equal(bad.source, null)
  assert.equal(bad.medium, null)
  assert.equal(bad.campaign, null)
  assert.equal(p({ campaign: "synthetic%40example.test" }).campaign, null)
  assert.equal(p({ campaign: "050-123-4567" }).campaign, null)
  const good = p({ source: "google", medium: "cpc", campaign: "spring_sale_20260510" })
  assert.equal(good.source, "google")
  assert.equal(good.medium, "cpc")
  assert.equal(good.campaign, "spring_sale_20260510")
  assert.equal(p({ campaign: "Porsche 911 Service | Q2" }).campaign, "Porsche 911 Service | Q2")
})
