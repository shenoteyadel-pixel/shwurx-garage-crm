import { test } from "node:test"
import assert from "node:assert/strict"
import {
  TRACKING_SETTING_KEYS,
  pickTrackingSettings,
  resolveControlCenterAccess,
} from "../lib/website/control-center-access"

test("denied roles get no control center access", () => {
  assert.equal(resolveControlCenterAccess([]), null)
  assert.equal(resolveControlCenterAccess(["jobs.view", "invoices.manage"]), null)
})

test("website-only, marketing-only and view-only roles resolve to disjoint scopes", () => {
  assert.deepEqual(resolveControlCenterAccess(["website.manage"]), {
    canManageWebsite: true,
    canViewMarketing: false,
    canManageMarketing: false,
  })
  assert.deepEqual(resolveControlCenterAccess(["marketing.manage"]), {
    canManageWebsite: false,
    canViewMarketing: true,
    canManageMarketing: true,
  })
  assert.deepEqual(resolveControlCenterAccess(["marketing.view"]), {
    canManageWebsite: false,
    canViewMarketing: true,
    canManageMarketing: false,
  })
})

test("tracking DTO strips pricing, rates, tax and company identifiers", () => {
  const full = {
    id: 1,
    company_name: "SHWURX",
    trn: "100000000000003",
    labour_rate_default: 250,
    quotation_validity_days: 14,
    tracking_enabled: true,
    ga4_measurement_id: "G-YV9FVWM29N",
    gtm_container_id: "GTM-P6C37X8X",
    meta_pixel_id: null,
    google_site_verification: "token",
  }
  const dto = pickTrackingSettings(full as never)
  assert.deepEqual(Object.keys(dto).sort(), [...TRACKING_SETTING_KEYS].sort())
  for (const leaked of ["trn", "labour_rate_default", "quotation_validity_days", "company_name", "id"]) {
    assert.ok(!(leaked in dto), `${leaked} must not be serialized`)
  }
})
