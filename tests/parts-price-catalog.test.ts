import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeCatalogSpec,
  validateCatalogSpec,
  validateSellingPrice,
  catalogSpecLabel,
} from "../lib/parts-catalog"
import {
  requiredScopeForMove,
  isOverrideActive,
  validateOverrideReason,
} from "../lib/work-authorization-rules"

test("oil needs brand, product line, viscosity and pack size", () => {
  const spec = normalizeCatalogSpec({ item_type: "oil", name: "Engine oil", quality: "genuine", unit: "each" })
  const error = validateCatalogSpec(spec)
  assert.match(error ?? "", /brand, product line, viscosity, pack size/)

  const full = normalizeCatalogSpec({
    item_type: "oil",
    name: "Engine oil",
    quality: "genuine",
    manufacturer: "Mobil",
    product_line: "1 ESP",
    viscosity: "5W-30",
    package_size: "4L",
    unit: "each",
  })
  assert.equal(validateCatalogSpec(full), null)
})

test("used parts need condition and warranty", () => {
  const spec = normalizeCatalogSpec({ name: "Alternator", quality: "used", part_number: "ABC-1", unit: "each" })
  assert.match(validateCatalogSpec(spec) ?? "", /condition and a warranty/)
  const ok = normalizeCatalogSpec({
    name: "Alternator",
    quality: "used",
    part_number: "ABC-1",
    condition: "Tested, grade A",
    warranty_months: 0,
    unit: "each",
  })
  assert.equal(validateCatalogSpec(ok), null)
  assert.match(catalogSpecLabel(ok), /No warranty/)
})

test("parts need a part number or exact specification", () => {
  const spec = normalizeCatalogSpec({ name: "Brake pads", quality: "aftermarket", unit: "set" })
  assert.match(validateCatalogSpec(spec) ?? "", /part number or an exact specification/)
})

test("selling price must be positive with at most two decimals", () => {
  assert.ok(validateSellingPrice(0))
  assert.ok(validateSellingPrice(-5))
  assert.ok(validateSellingPrice("abc"))
  assert.ok(validateSellingPrice(10.123))
  assert.equal(validateSellingPrice(199.99), null)
})

test("moving into repair from an earlier stage needs start_work", () => {
  assert.equal(requiredScopeForMove("diagnosis" as never, "repair" as never), "start_work")
  assert.equal(requiredScopeForMove("repair" as never, "repair" as never), null)
})

test("overrides expire, can be revoked and are scope-specific", () => {
  const now = new Date("2026-10-27T12:00:00Z")
  const row = { scope: "start_work", expires_at: "2026-10-28T11:00:00Z", revoked_at: null }
  assert.equal(isOverrideActive(row, "start_work", now), true)
  assert.equal(isOverrideActive(row, "order_parts", now), false)
  assert.equal(isOverrideActive({ ...row, revoked_at: "2026-10-27T13:00:00Z" }, "start_work", now), false)
  assert.equal(isOverrideActive({ ...row, expires_at: "2026-10-27T11:00:00Z" }, "start_work", now), false)
})

test("override reason must be meaningful", () => {
  assert.ok(validateOverrideReason("urgent"))
  assert.equal(validateOverrideReason("Customer called, car needed for hospital trip"), null)
})
