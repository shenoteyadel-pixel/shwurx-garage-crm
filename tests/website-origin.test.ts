import { test } from "node:test"
import assert from "node:assert/strict"
import { CANONICAL_ORIGIN, resolveSiteOrigin, siteOriginDiagnostic } from "../lib/website/env"

test("public URL diagnostics and canonical URLs use the same configured origin", () => {
  for (const raw of [CANONICAL_ORIGIN, `${CANONICAL_ORIGIN}/`, ` ${CANONICAL_ORIGIN} `]) {
    assert.deepEqual(siteOriginDiagnostic(raw), { origin: CANONICAL_ORIGIN, source: "configured" })
    assert.equal(resolveSiteOrigin(raw), CANONICAL_ORIGIN)
  }
})

test("missing, malformed and foreign configuration falls back without exposing the input", () => {
  for (const raw of ["", " ", "NEXT_PUBLIC_SITE_URL", "not a URL", "https://preview.example.invalid", "http://www.swurxauto.com", "https://swurxauto.com", `${CANONICAL_ORIGIN}/private?token=synthetic`]) {
    assert.deepEqual(siteOriginDiagnostic(raw), { origin: CANONICAL_ORIGIN, source: "fallback" })
    assert.equal(resolveSiteOrigin(raw), CANONICAL_ORIGIN)
  }
})
