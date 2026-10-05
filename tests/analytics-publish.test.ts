import { test } from "node:test"
import assert from "node:assert/strict"
import { planAnalyticsPublish, onlyAnalyticsChanged } from "../lib/website/analytics-publish"
import { assignedMediaIds, liveMediaIds, mediaStatus } from "../lib/website/media-usage"
import { seedDocument } from "../lib/website/seed"
import type { WebsiteDocument } from "../lib/website/types"

function fixtures() {
  const live = seedDocument()
  const draft: WebsiteDocument = structuredClone(live)
  draft.business.name = { en: "Unpublished draft name", ar: "مسودة" }
  return { live, draft }
}

test("analytics publish swaps ONLY analytics into the live doc and keeps unpublished draft edits unpublished", () => {
  const { live, draft } = fixtures()
  const plan = planAnalyticsPublish(
    { analytics: { ...live.analytics, enabled: false }, expectedDraftVersion: 4, expectedLiveRevisionId: 9 },
    { draft, draftVersion: 4, live, liveRevisionId: 9 },
  )
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.ok(onlyAnalyticsChanged(live, plan.live), "live content must be untouched")
  assert.ok(onlyAnalyticsChanged(draft, plan.draft), "draft content must be untouched")
  assert.notEqual(plan.live.business.name.en, "Unpublished draft name")
  assert.equal(plan.config.managed, true)
})

test("stale draft or live revision is a conflict, never a silent overwrite", () => {
  const { live, draft } = fixtures()
  const state = { draft, draftVersion: 4, live, liveRevisionId: 9 }
  const staleDraft = planAnalyticsPublish({ analytics: live.analytics, expectedDraftVersion: 3, expectedLiveRevisionId: 9 }, state)
  const staleLive = planAnalyticsPublish({ analytics: live.analytics, expectedDraftVersion: 4, expectedLiveRevisionId: 8 }, state)
  assert.equal(staleDraft.ok, false)
  assert.equal(staleLive.ok, false)
  assert.equal(!staleDraft.ok && staleDraft.conflict, true)
  assert.equal(!staleLive.ok && staleLive.conflict, true)
})

test("analytics cannot publish before the site has a live revision", () => {
  const { draft } = fixtures()
  const plan = planAnalyticsPublish(
    { analytics: draft.analytics, expectedDraftVersion: 1, expectedLiveRevisionId: 1 },
    { draft, draftVersion: 1, live: null, liveRevisionId: null },
  )
  assert.equal(plan.ok, false)
})

test("media status separates approved-but-unassigned, draft-only and live", () => {
  const doc = seedDocument()
  doc.media = [
    ...doc.media,
    { ...doc.media[0], id: "m_unused", approval: "approved", publicSafe: true },
    { ...doc.media[0], id: "m_pending", approval: "needs_review", publicSafe: true },
  ] as WebsiteDocument["media"]
  const assigned = assignedMediaIds(doc)
  assert.equal(assigned.has("m_unused"), false, "library entries alone are not assignments")
  const live = new Set(liveMediaIds(doc))
  assert.equal(mediaStatus({ id: "m_unused", approval: "approved", publicSafe: true }, assigned, live), "unused")
  assert.equal(mediaStatus({ id: "m_pending", approval: "needs_review", publicSafe: true }, assigned, live), "hidden")
  assert.equal(mediaStatus({ id: "m_x", approval: "approved", publicSafe: true }, new Set(["m_x"]), new Set()), "draft_only")
  for (const id of live) assert.ok(assigned.has(id))
})
