import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeRuntime,
  resolveRuntime,
  sanitizeAnalytics,
  SEED_ANALYTICS,
  analyticsIssues,
} from "../lib/website/analytics"

const prod = { preview: false, indexable: true }

test("undefined / partial runtime never throws and is fully off", () => {
  for (const v of [undefined, null, {}, "x", { verificationToken: 5 }]) {
    const t = normalizeRuntime(v)
    assert.equal(t.thirdParty, false)
    assert.equal(t.firstParty, false)
    assert.equal(t.verificationToken, null)
    assert.equal(t.events.lead, "generate_lead")
  }
})

test("missing stored analytics falls back to the inactive verified seed", () => {
  const cfg = sanitizeAnalytics(undefined)
  assert.equal(cfg.enabled, false)
  assert.equal(cfg.managed, false)
  assert.equal(cfg.gtmId, "GTM-P6C37X8X")
  assert.equal(cfg.ga4Id, "G-YV9FVWM29N")
  assert.equal(cfg.adsId, "AW-18492310896")
  assert.equal(cfg.adsLabels.lead, "GZQOCNmf1ZEdEPCK6fFE")
  assert.equal(cfg.adsLabels.phone_click, "Urt4CNyf1ZEdEPCK6fFE")
  assert.equal(cfg.adsLabels.whatsapp_click, "YYStCN-f1ZEdEPCK6fFE")
})

test("resolveRuntime tolerates a partial stored config", () => {
  const t = resolveRuntime({ managed: true } as never, "www.swurxauto.com", prod)
  assert.equal(t.thirdParty, false)
  assert.equal(resolveRuntime(undefined, "www.swurxauto.com", prod).thirdParty, false)
})

test("seed is inactive: no tags load even on the production host", () => {
  const t = resolveRuntime(SEED_ANALYTICS, "www.swurxauto.com", prod)
  assert.equal(t.thirdParty, false)
  assert.equal(t.verificationToken, "onMwYj2YCnJTx5G20r0FRfjJwvS6BA_X1qX1fRcaE5I")
})

test("single GTM owner: GA4/Ads never load directly when enabled", () => {
  const t = resolveRuntime({ ...SEED_ANALYTICS, managed: true, enabled: true }, "www.swurxauto.com", prod)
  assert.equal(t.mode, "gtm")
  assert.equal(t.gtmId, "GTM-P6C37X8X")
  assert.equal(t.ga4Id, "G-YV9FVWM29N", "data-only GTM routing reference")
  assert.equal(t.adsId, "AW-18492310896", "data-only GTM routing reference")
  assert.equal(resolveRuntime({ ...SEED_ANALYTICS, managed: true, enabled: true }, "preview.vercel.app", prod).thirdParty, false)
  const errors = analyticsIssues({ ...SEED_ANALYTICS, managed: true, enabled: true }).filter((i) => i.level === "error")
  assert.deepEqual(errors, [])
})
