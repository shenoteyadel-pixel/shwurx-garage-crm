import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeDocument } from "../lib/website/normalize"
import { HERO_CONCEPT_ID, ILLUSTRATIVE_SEED, illustrativePortraitId, seedDocument, teamSlotId } from "../lib/website/seed"

function legacy(): Record<string, unknown> {
  const doc = structuredClone(seedDocument()) as unknown as Record<string, unknown>
  delete doc.appliedSeeds
  const d = doc as unknown as ReturnType<typeof seedDocument>
  d.media = d.media.filter((m) => m.source !== "ai_illustration")
  d.pages.home.heroImageId = "site-hero"
  for (const m of d.pages.team.members) m.photoId = null
  return doc
}

test("fresh seed carries hero, 18 portraits and the seed marker", () => {
  const doc = normalizeDocument(seedDocument())
  assert.equal(doc.pages.home.heroImageId, HERO_CONCEPT_ID)
  assert.equal(doc.media.filter((m) => m.source === "ai_illustration").length, 19)
  assert.equal(doc.pages.team.members.filter((m) => m.photoId?.startsWith("team-illustrative-")).length, 18)
  assert.ok(doc.appliedSeeds.includes(ILLUSTRATIVE_SEED))
})

test("legacy document is backfilled additively", () => {
  const doc = normalizeDocument(legacy())
  assert.equal(doc.pages.home.heroImageId, HERO_CONCEPT_ID)
  assert.equal(doc.pages.team.members.find((m) => m.id === teamSlotId(3))?.photoId, illustrativePortraitId(3))
})

test("owner content is never overwritten", () => {
  const raw = legacy() as unknown as ReturnType<typeof seedDocument>
  raw.pages.home.heroImageId = "owner-hero"
  const named = raw.pages.team.members.find((m) => m.id === teamSlotId(1))!
  named.name = { en: "Real Person", ar: "" }
  const photographed = raw.pages.team.members.find((m) => m.id === teamSlotId(2))!
  photographed.photoId = "owner-photo"
  const doc = normalizeDocument(raw)
  assert.equal(doc.pages.home.heroImageId, "owner-hero")
  assert.equal(doc.pages.team.members.find((m) => m.id === teamSlotId(1))?.photoId, null)
  assert.equal(doc.pages.team.members.find((m) => m.id === teamSlotId(2))?.photoId, "owner-photo")
})

test("after the marker, owner removals stick", () => {
  const first = normalizeDocument(legacy())
  first.pages.team.members[0].photoId = null
  first.media = first.media.filter((m) => m.id !== illustrativePortraitId(1))
  const again = normalizeDocument(structuredClone(first))
  assert.equal(again.pages.team.members[0].photoId, null)
  assert.ok(!again.media.some((m) => m.id === illustrativePortraitId(1)))
  assert.equal(again.appliedSeeds.filter((s) => s === ILLUSTRATIVE_SEED).length, 1)
})
