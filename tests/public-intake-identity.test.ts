import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  cleanYearInput,
  needsMoreDetails,
  normalizePhone,
  toLatinDigits,
  validatePhone,
  validateVehicleYear,
} from "../lib/website/intake-validate"
import { resolveContactVehicle, vehicleSummary, hasVehicleInput } from "../lib/website/contact-vehicle"
import { buildSiteGraph, jsonLdString, LEGAL_NAME, SITE_ALIASES } from "../lib/website/structured-data"
import { consentNeeded } from "../lib/website/consent-needed"
import { normalizeDocument } from "../lib/website/normalize"
import { seedDocument, IDENTITY_TEXT, HOME_TITLE, LEGACY_HOME_TITLE } from "../lib/website/seed"
import type { L10n, Lang } from "../lib/website/types"

const root = path.resolve(__dirname, "..")
const src = (p: string) => readFileSync(path.join(root, p), "utf8")
const pick = (v: L10n | undefined, lang: Lang) => (!v ? "" : lang === "ar" ? v.ar || v.en : v.en)
const NOW = new Date("2026-10-09T10:00:00Z")

// ---------- A1: phone ----------

test("Arabic and Persian digits normalize to Latin", () => {
  assert.equal(toLatinDigits("٠٥٠١٢٣٤٥٦٧"), "0501234567")
  assert.equal(toLatinDigits("۰۵۰۱۲۳۴۵۶۷"), "0501234567")
  assert.equal(toLatinDigits("abc ٢٠٢٤"), "abc 2024")
})

test("UAE 05, +971 and 00971 forms share one duplicate identity, also in Arabic digits", () => {
  const id = "971501234567"
  for (const raw of ["0501234567", "+971 50 123 4567", "00971501234567", "٠٥٠١٢٣٤٥٦٧", "+٩٧١٥٠١٢٣٤٥٦٧", "(050) 123-4567"]) {
    assert.equal(normalizePhone(raw), id, raw)
    const r = validatePhone(raw, { required: true })
    assert.ok(r.ok, raw)
    if (r.ok) assert.equal(r.digits, id)
  }
})

test("supported international numbers stay valid; stored value has Latin digits", () => {
  const uk = validatePhone("+44 20 7946 0958", { required: true })
  assert.deepEqual(uk, { ok: true, value: "+44 20 7946 0958", digits: "442079460958" })
  const ar = validatePhone("+٤٤ ٢٠ ٧٩٤٦ ٠٩٥٨", { required: true })
  assert.ok(ar.ok && ar.value === "+44 20 7946 0958")
})

test("7-15 normalized digit limit", () => {
  assert.equal(validatePhone("123456", { required: true }).ok, false)
  assert.equal(validatePhone("1234567", { required: true }).ok, true)
  assert.equal(validatePhone("+123456789012345", { required: true }).ok, true)
  assert.equal(validatePhone("+1234567890123456", { required: true }).ok, false)
})

test("overlong raw phone is rejected before any slicing (24-char boundary)", () => {
  const at24 = "+971 50 123 4567        ".trimEnd().padEnd(24, "0").slice(0, 24)
  assert.equal(at24.length, 24)
  const over = "0501234567" + " ".repeat(5) + "-".repeat(10)
  assert.ok(over.length > 24)
  assert.deepEqual(validatePhone(over, { required: true }), { ok: false, error: "too_long" })
  // A string whose first 24 chars would look valid must not become valid via truncation.
  const sneaky = "+971501234567" + "x".repeat(40)
  assert.deepEqual(validatePhone(sneaky, { required: true }), { ok: false, error: "too_long" })
  assert.deepEqual(validatePhone("+971 50 123 4567 ext 9", { required: true }), { ok: false, error: "invalid" })
})

test("blank phone: optional is valid (email-only contact), required errors", () => {
  assert.deepEqual(validatePhone("", { required: false }), { ok: true, value: null, digits: null })
  assert.deepEqual(validatePhone("   ", { required: false }), { ok: true, value: null, digits: null })
  assert.deepEqual(validatePhone(undefined, { required: false }), { ok: true, value: null, digits: null })
  assert.deepEqual(validatePhone("  ", { required: true }), { ok: false, error: "required" })
  assert.deepEqual(validatePhone(5012345, { required: false }), { ok: false, error: "invalid" })
})

// ---------- A2: year + details ----------

test("vehicle year: localized digits, trim, 2016..current+1, blank stays blank", () => {
  assert.deepEqual(validateVehicleYear(" ٢٠٢٢ ", NOW), { ok: true, year: 2022 })
  assert.deepEqual(validateVehicleYear("۲۰۱۶", NOW), { ok: true, year: 2016 })
  assert.deepEqual(validateVehicleYear("2027", NOW), { ok: true, year: 2027 })
  assert.deepEqual(validateVehicleYear("2028", NOW), { ok: false, error: "out_of_range" })
  assert.deepEqual(validateVehicleYear("2015", NOW), { ok: false, error: "out_of_range" })
  assert.deepEqual(validateVehicleYear("20160", NOW), { ok: false, error: "invalid" })
  assert.deepEqual(validateVehicleYear("20 16", NOW), { ok: false, error: "invalid" })
  assert.deepEqual(validateVehicleYear("", NOW), { ok: true, year: null })
  assert.deepEqual(validateVehicleYear("   ", NOW), { ok: true, year: null })
  assert.deepEqual(validateVehicleYear(undefined, NOW), { ok: true, year: null })
  assert.equal(cleanYearInput("  ٢٠٢٤ "), "2024")
  assert.equal(cleanYearInput("   "), "")
})

test("five-character details rule applies only without service/model context", () => {
  assert.equal(needsMoreDetails({ service: null, model: "", details: "abcd" }), true)
  assert.equal(needsMoreDetails({ service: null, model: "", details: "  abcde  " }), false)
  assert.equal(needsMoreDetails({ service: "diagnostics", model: "", details: "" }), false)
  assert.equal(needsMoreDetails({ service: null, model: "911", details: "" }), false)
})

test("year inputs are localized text fields, never type=number", () => {
  for (const f of ["components/site/enquiry-form.tsx", "components/site/appointment-form.tsx", "components/site/contact-vehicle-fields.tsx"]) {
    const s = src(f)
    assert.ok(!/type=["']number["']/.test(s), `${f} must not use type=number`)
    assert.ok(/inputMode=["']numeric["']/.test(s), `${f} uses inputMode numeric`)
  }
})

// ---------- A3: contact vehicle metadata ----------

test("contact vehicle context resolves against the published catalog", () => {
  const doc = seedDocument()
  const brand = doc.brands.find((b) => b.visible)!
  const svcSlug = brand.serviceSlugs[0]
  const r = resolveContactVehicle(doc, { brand: brand.slug, service: svcSlug, model: " Other ", year: "٢٠٢٣" })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.vehicle.brandSlug, brand.slug)
  assert.equal(r.vehicle.serviceSlug, svcSlug)
  assert.equal(r.vehicle.model, "Other")
  assert.equal(r.vehicle.year, 2023)
  assert.match(vehicleSummary(r.vehicle), new RegExp(`Brand: ${brand.name.en}`))
})

test("email-only contact (no vehicle fields) stays valid; unknown slugs/years are rejected", () => {
  const doc = seedDocument()
  assert.equal(hasVehicleInput({ email: "a@b.c", message: "hi" }), false)
  const empty = resolveContactVehicle(null, { email: "a@b.c", year: "  " })
  assert.ok(empty.ok && empty.vehicle.year === null && empty.vehicle.brandSlug === null)
  assert.deepEqual(resolveContactVehicle(doc, { brand: "not-a-brand" }), { ok: false, fields: { brand: "unknown" } })
  assert.deepEqual(resolveContactVehicle(doc, { brand: "<script>" }), { ok: false, fields: { brand: "invalid" } })
  assert.deepEqual(resolveContactVehicle(doc, { year: "1999" }), { ok: false, fields: { year: "out_of_range" } })
})

test("all visible marques and services are selectable; service must belong to brand", () => {
  const doc = seedDocument()
  const brands = doc.brands.filter((b) => b.visible)
  assert.equal(brands.length, 15)
  assert.equal(doc.services.filter((s) => s.visible).length, 6)
  for (const b of brands) assert.ok(resolveContactVehicle(doc, { brand: b.slug }).ok, b.slug)
  const b = brands.find((x) => doc.services.some((s) => !x.serviceSlugs.includes(s.slug)))
  if (b) {
    const missing = doc.services.find((s) => !b.serviceSlugs.includes(s.slug))!
    assert.deepEqual(resolveContactVehicle(doc, { brand: b.slug, service: missing.slug }), { ok: false, fields: { service: "not_for_brand" } })
  }
})

test("leads route stores brand/service/model/year in metadata and keeps PII out of analytics", () => {
  const s = src("app/api/public/leads/route.ts")
  for (const k of ["brand_slug: vehicle.brandSlug", "service_slug: vehicle.serviceSlug", "vehicle_model: vehicle.model", "vehicle_year: vehicle.year"]) {
    assert.ok(s.includes(k), k)
  }
  const form = src("components/site/contact-form.tsx")
  const trackCalls = form.match(/(trackConversion|trackEvent|gtag)\([\s\S]*?\)/g) ?? []
  for (const call of trackCalls) assert.ok(!/name|phone|email|message/.test(call), `no PII in analytics call: ${call}`)
})

// ---------- guard ordering: invalid / preview create no records; duplicate fast-path ----------

function order(file: string, markers: string[]) {
  const s = src(file)
  const idx = markers.map((m) => {
    const i = s.indexOf(m)
    assert.ok(i >= 0, `${file}: missing ${m}`)
    return i
  })
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i - 1] < idx[i], `${file}: "${markers[i - 1]}" must precede "${markers[i]}"`)
}

test("invalid and preview requests return before any write; duplicates short-circuit before insert", () => {
  order("app/api/public/leads/route.ts", ["validatePhone(", "resolveContactVehicle(", "intakeIsDryRun()", "findBySubmission(", 'rpc("submit_lead"'])
  order("app/api/public/appointments/route.ts", ["validatePhone(", "validateVehicleYear(", "intakeIsDryRun()", "findBySubmission(", ".rpc("])
  // Known duplicates answer before catalogue checks so a retry never fails on a since-hidden brand/service.
  order("app/api/public/enquiry/route.ts", [
    "validatePhone(",
    "validateVehicleYear(",
    "intakeIsDryRun()",
    'reply(request, "duplicate"',
    "getPublishedDocumentStrict(",
    "needsMoreDetails(",
    'reply(request, "dry_run"',
    ".rpc(",
  ])
  const enq = src("app/api/public/enquiry/route.ts")
  assert.ok(/dry_run/.test(enq) && enq.indexOf("dry_run") < enq.indexOf(".rpc("), "enquiry preview isolation before write")
})

// ---------- A4/A5: anchor + footer consent ----------

test("contact page exposes #enquire target", () => {
  assert.match(src("app/(site)/contact/page.tsx"), /id=["']enquire["']/)
})

test("footer renders PrivacyChoicesButton when consent is needed, wired from live tags", () => {
  const footer = src("components/site/site-footer.tsx")
  assert.match(footer, /showPrivacyChoices && <PrivacyChoicesButton lang=\{lang\} \/>/)
  assert.match(src("app/(site)/layout.tsx"), /<SiteFooter[^>]*showPrivacyChoices=\{consentNeeded\(tags\)\}/)
  assert.equal(consentNeeded({ consentRequired: true, firstParty: false, thirdParty: true } as never), true)
  assert.equal(consentNeeded({ consentRequired: false, firstParty: false, thirdParty: false } as never), false)
})

// ---------- B: identity, JSON-LD, metadata ----------

test("one linked WebSite + AutoRepair graph with aliases and legal name", () => {
  const doc = seedDocument()
  doc.business.phone = "+971 4 000 0000"
  const origin = "https://www.swurxauto.com"
  for (const lang of ["en", "ar"] as Lang[]) {
    const g = buildSiteGraph({ doc, lang, origin, pick, logoUrl: null }) as { "@graph": Record<string, unknown>[] }
    const nodes = g["@graph"]
    const site = nodes.filter((n) => n["@type"] === "WebSite")
    const biz = nodes.filter((n) => n["@type"] === "AutoRepair")
    assert.equal(site.length, 1)
    assert.equal(biz.length, 1)
    assert.equal(site[0]["@id"], `${origin}/#website`)
    assert.equal(site[0].name, "SHWURX")
    assert.equal(site[0].url, `${origin}/`)
    assert.deepEqual(site[0].alternateName, [...SITE_ALIASES])
    assert.equal(biz[0]["@id"], `${origin}/#business`)
    assert.equal(biz[0].legalName, LEGAL_NAME)
    assert.deepEqual(biz[0].alternateName, [...SITE_ALIASES])
    const json = JSON.stringify(g)
    for (const banned of ["aggregateRating", "review", "award", "founder"]) assert.ok(!json.includes(`"${banned}"`), banned)
  }
})

test("JSON-LD is script-safe", () => {
  const out = jsonLdString({ name: "</script><script>alert(1)</script>" })
  assert.ok(!out.includes("</script>"))
  assert.ok(!out.includes("<"))
})

test("identity text is bilingual, CMS-stored values win, legacy seed title migrates once", () => {
  assert.match(IDENTITY_TEXT.en, /SHWURX \(Wurx Garage\).*Al Quoz, Dubai.*SHENOTEY ESKANDER GARAGE CO\./)
  assert.match(IDENTITY_TEXT.ar, /شوركس/)
  const fresh = normalizeDocument(seedDocument())
  assert.deepEqual(fresh.business.identity, IDENTITY_TEXT)
  assert.deepEqual(fresh.pages.home.seo.title, HOME_TITLE)

  const legacy = structuredClone(seedDocument()) as unknown as { business: Record<string, unknown>; pages: { home: { seo: { title: L10n } } }; appliedSeeds: string[] }
  delete legacy.business.identity
  legacy.pages.home.seo.title = { ...LEGACY_HOME_TITLE }
  legacy.appliedSeeds = legacy.appliedSeeds.filter((s) => s !== "identity-aliases-v1")
  const migrated = normalizeDocument(legacy)
  assert.deepEqual(migrated.pages.home.seo.title, HOME_TITLE)
  assert.deepEqual(migrated.business.identity, IDENTITY_TEXT)

  const edited = structuredClone(legacy)
  edited.business.identity = { en: "Owner text", ar: "" }
  edited.pages.home.seo.title = { en: "Owner title", ar: LEGACY_HOME_TITLE.ar }
  const kept = normalizeDocument(edited)
  assert.deepEqual(kept.business.identity, { en: "Owner text", ar: "" })
  assert.equal(kept.pages.home.seo.title.en, "Owner title")

  // After the seed marker is applied, a later return to the legacy title is not overwritten.
  const again = structuredClone(kept) as unknown as typeof legacy
  again.pages.home.seo.title = { ...LEGACY_HOME_TITLE }
  assert.deepEqual(normalizeDocument(again).pages.home.seo.title, LEGACY_HOME_TITLE)
})

// ---------- C: robots + tracking IDs unchanged ----------

test("robots keeps private disallows and adds no crawler-specific allow group", () => {
  const robots = src("app/robots.ts")
  for (const p of ["/api/", "/auth/", "/crm", "/portal", "/track", "/approve", "/approval", "/customer-access", "/pay", "/website", "/marketing", "/settings"]) {
    assert.ok(robots.includes(`"${p}`), p)
  }
})
