// Real authenticated action; only database/session/cache/audit I/O is stubbed.
import { test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ManualLeadResult } from "../lib/manual-lead"

const url = (p: string) => pathToFileURL(path.resolve(__dirname, "..", p)).href
type Row = { id: string; phone: string; status: string; metadata: Record<string, unknown>; [key: string]: unknown }
const state = { ctx: null as any, dry: false, dbCalls: 0, serviceCalls: 0, inserts: 0, rows: [] as Row[], audit: [] as unknown[], refreshed: 0, readError: false, writeError: false }
const baseCtx = () => ({ userId: "staff-1", name: "Staff", isActive: true, isStaff: true, role: "owner", permissions: new Set(["leads.manage"]) })
mock.module(url("lib/rbac/context.ts"), { namedExports: { getSessionContext: async () => state.ctx, requirePermission: async () => { if (!state.ctx?.permissions.has("leads.manage")) throw new Error("Forbidden"); return state.ctx }, logAction: async (...args: unknown[]) => { state.audit.push(args) } } })
mock.module(url("lib/actions-notifications.ts"), { namedExports: { notifyByPermission: async () => {} } })
mock.module(url("lib/website/intake-guard.ts"), { namedExports: { intakeIsDryRun: async () => state.dry } })
mock.module("next/cache", { namedExports: { revalidatePath: () => { state.refreshed++ } } })
const testDb = () => {
  state.dbCalls++
  return { from: (table: string) => {
    assert.equal(table, "leads")
    let id: string | null = null, filter: string | null = null, revision: string | null = null, status: string | null = null, notStatus: string | null = null, patch: Record<string, unknown> | null = null
    const nullFields: string[] = []
    const q = {
      select: () => q, eq: (key: string, value: string) => { if (key === "id") id = value; else if (key === "metadata->>manual_revision") revision = value; else if (key === "status") status = value; return q },
      update: (value: Record<string, unknown>) => { patch = value; return q },
      in: () => q, is: (key: string) => { nullFields.push(key); return q }, neq: (_: string, value: string) => { notStatus = value; return q }, or: (value: string) => { filter = value; return q }, limit: () => q,
      maybeSingle: async () => {
        if (state.readError) return { data: null, error: { code: "UNAVAILABLE" } }
        const row = id ? state.rows.find(r => r.id === id) : state.rows.find(r => ["new", "contacted", "qualified"].includes(r.status) && !r.metadata.deleted_at && filter?.includes(`phone.eq.${r.phone}`))
        if (patch && row) {
          if (revision !== null && String(row.metadata.manual_revision) !== revision) return { data: null, error: null }
          if ((status && row.status !== status) || (notStatus && row.status === notStatus) || nullFields.some(k => k === "metadata->>deleted_at" ? row.metadata.deleted_at != null : row[k] != null)) return { data: null, error: null }
          Object.assign(row, structuredClone(patch))
        }
        return { data: row ? structuredClone(row) : null, error: null }
      },
      insert: async (row: Row) => {
        if (state.writeError) return { error: { code: "FAIL" } }
        if (state.rows.some(r => r.id === row.id)) return { error: { code: "23505" } }
        state.inserts++; state.rows.push(structuredClone(row)); return { error: null }
      },
    }
    return q
  } }
}
mock.module(url("lib/supabase/server.ts"), { namedExports: { createClient: async () => testDb(), createServiceClient: () => { state.serviceCalls++; return testDb() } } })
let create: (raw: unknown) => Promise<ManualLeadResult>
let followUp: (id: string, raw: unknown) => Promise<ManualLeadResult>
let genericStatus: (id: string, status: any) => Promise<unknown>
let convert: (id: string, opts?: { useExistingCustomerId?: string }) => Promise<unknown>
let remove: (id: string) => Promise<unknown>
let assign: (id: string, staff: string | null) => Promise<unknown>
let addNote: (id: string, text: string) => Promise<unknown>
before(async () => {
  const actions = await import("../lib/actions-manual-leads"); create = actions.createManualLead; followUp = actions.recordManualLeadFollowUp
  const generic = await import("../lib/actions-leads"); genericStatus = generic.setLeadStatus; convert = generic.convertLeadToCustomer; remove = generic.deleteLead; assign = generic.assignLead; addNote = generic.addLeadNote
})
beforeEach(() => Object.assign(state, { ctx: baseCtx(), dry: false, dbCalls: 0, serviceCalls: 0, inserts: 0, rows: [], audit: [], refreshed: 0, readError: false, writeError: false }))
const input = () => ({ submissionId: "9dc07ec2-95e6-4195-b450-0a7b58799db2", name: "TEST - EXCLUDE", phone: "+12025550145", channel: "whatsapp", make: "Porsche", model: "Cayenne", year: "2020", fault: "Engine overheating", reportedSource: "google_ads", sourceDetail: "Customer said Google", contactResult: "received", followUpResult: "pending", occurredAt: "2026-10-23T15:00:00+04:00", evidence: "Company inbox received message at 15:00 Dubai.", qualification: "", nextAction: "" })

test("anonymous, customer, inactive and read-only marketing users cannot write", async () => {
  for (const ctx of [null, { ...baseCtx(), isStaff: false }, { ...baseCtx(), isActive: false }, { ...baseCtx(), role: "marketing", permissions: new Set(["leads.view", "marketing.manage"]) }]) {
    state.ctx = ctx; const r = await create({ ...input(), userId: "staff-1", role: "owner", permissions: ["leads.manage"] }); assert.equal(r.ok, false)
    assert.deepEqual(r, { ok: false, error: ctx ? "forbidden" : "unauthorized" })
  }
  assert.equal(state.dbCalls, 0); assert.equal(state.audit.length, 0); assert.equal(state.serviceCalls, 0)
})
test("invalid fields and preview dry-run never access production rows", async () => {
  assert.equal((await create({ ...input(), phone: "bad" })).ok, false)
  state.dry = true; assert.deepEqual(await create(input()), { ok: true, outcome: "dry_run", id: null })
  assert.equal(state.dbCalls, 0); assert.equal(state.inserts, 0); assert.equal(state.serviceCalls, 0)
})
test("saves only staff-reported intake, no paid IDs, customer link, conversion token or PII audit", async () => {
  const r = await create({ ...input(), gclid: "fake", utm_source: "google", campaign_id: "123", status: "converted", metadata: { provider: "google" } })
  assert.ok(r.ok); assert.equal(r.outcome, "created")
  const row = state.rows[0]
  assert.equal(row.source, "manual_whatsapp"); assert.equal(row.status, "new"); assert.equal(row.customer_id, null)
  assert.equal(row.metadata.reported_source, "google_ads"); assert.equal(row.metadata.attribution_kind, "self_reported")
  assert.equal(row.metadata.vehicle_year, 2020); assert.equal(row.metadata.recorded_by, "staff-1")
  for (const key of ["gclid", "utm_source", "campaign_id", "provider", "first_touch", "latest_touch"]) assert.equal(key in row.metadata, false)
  assert.deepEqual(Object.keys(r).sort(), ["id", "ok", "outcome"])
  const audit = JSON.stringify(state.audit)
  assert.ok(!audit.includes(input().phone)); assert.ok(!audit.includes(input().fault)); assert.ok(!audit.includes(input().name))
  assert.equal(state.serviceCalls, 1); assert.equal(state.inserts, 1)
  await create(input()); assert.equal(state.serviceCalls, 1, "retry returns original before constructing privileged client")
})
test("response-loss retry and concurrent identical requests create one row and one audit", async () => {
  const results = await Promise.all([create(input()), create(input())])
  assert.ok(results.every(r => r.ok)); assert.equal(state.inserts, 1); assert.equal(state.rows.length, 1); assert.equal(state.audit.length, 1)
  const retry = await create(input()); assert.ok(retry.ok); assert.equal(retry.outcome, "duplicate"); assert.equal(retry.id, state.rows[0].id)
})
test("same submission with altered payload conflicts rather than silently overwriting", async () => {
  await create(input()); assert.deepEqual(await create({ ...input(), fault: "different fault" }), { ok: false, error: "conflict" })
  assert.equal(state.rows[0].message, input().fault); assert.equal(state.inserts, 1)
})
test("existing open contact returns its ID without creating a duplicate or changing source/status", async () => {
  state.rows.push({ id: "existing-lead", phone: input().phone, status: "contacted", source: "facebook", metadata: {} })
  assert.deepEqual(await create(input()), { ok: false, error: "existing_contact", existingId: "existing-lead" })
  assert.equal(state.inserts, 0); assert.equal(state.rows[0].source, "facebook"); assert.equal(state.audit.length, 0)
})
test("read and write failures return safe error, never PII/database internals", async () => {
  state.readError = true; assert.deepEqual(await create(input()), { ok: false, error: "unavailable" }); assert.equal(state.inserts, 0)
  state.readError = false; state.writeError = true; assert.deepEqual(await create(input()), { ok: false, error: "unavailable" }); assert.equal(state.audit.length, 0)
})
test("an existing Meta contact using 00 international prefix blocks a second open lead", async () => {
  state.rows.push({ id: "meta-existing", phone: "0012025550145", status: "new", source: "facebook", metadata: { external_id: "meta:test" } })
  assert.deepEqual(await create(input()), { ok: false, error: "existing_contact", existingId: "meta-existing" })
  assert.equal(state.inserts, 0)
})
const follow = () => ({ ...input(), submissionId: "1fb69cc1-ea65-4706-adab-a0bfffe02c3d", contactResult: "conversation", followUpResult: "qualified", qualification: "Confirmed engine repair enquiry and workshop visit intent", evidence: "New two-way messages reviewed in company inbox at 16:00.", occurredAt: "2026-10-23T16:00:00+04:00" })
test("follow-up preserves original intake/source, appends evidence and supports an idempotent retry", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  const original = structuredClone(state.rows[0])
  const r = await followUp(id, follow()); assert.ok(r.ok)
  assert.equal(state.rows[0].status, "qualified")
  assert.equal(state.rows[0].metadata.recorded_at, original.metadata.recorded_at)
  assert.equal(state.rows[0].metadata.manual_submission_id, original.metadata.manual_submission_id)
  assert.deepEqual(state.rows[0].metadata.manual_initial, original.metadata.manual_initial)
  assert.equal(state.rows[0].source, original.source)
  assert.equal((state.rows[0].metadata.notes as unknown[]).length, 2)
  assert.equal((state.rows[0].metadata.manual_followup_history as unknown[]).length, 1)
  assert.deepEqual(await followUp(id, follow()), { ok: true, outcome: "duplicate", id })
  assert.equal((state.rows[0].metadata.notes as unknown[]).length, 2)
})
test("follow-up rejects source/identity rewriting, unqualified contact and permission denial", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  assert.deepEqual(await followUp(id, { ...follow(), reportedSource: "facebook" }), { ok: false, error: "conflict" })
  assert.deepEqual(await followUp(id, { ...follow(), phone: "+12025550146" }), { ok: false, error: "conflict" })
  assert.equal((await followUp(id, { ...follow(), contactResult: "received" })).ok, false)
  state.ctx = { ...baseCtx(), permissions: new Set(["leads.view"]) }
  assert.deepEqual(await followUp(id, follow()), { ok: false, error: "forbidden" })
  assert.equal(state.rows[0].status, "new")
})
test("simultaneous follow-ups cannot overwrite each other's history", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  const r = await Promise.all([followUp(id, follow()), followUp(id, { ...follow(), submissionId: "e0413409-6d09-459b-a316-b2a230344273" })])
  assert.equal(r.filter(x => x.ok).length, 1)
  assert.equal(r.filter(x => !x.ok && x.error === "conflict").length, 1)
  assert.equal((state.rows[0].metadata.notes as unknown[]).length, 2)
})
test("generic status and customer conversion cannot bypass manual qualification evidence", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  await assert.rejects(genericStatus(id, "qualified"), /Record follow-up/)
  await assert.rejects(genericStatus(id, "converted"), /Record follow-up/)
  await assert.rejects(convert(id), /evidence-backed qualified/)
  await assert.rejects(addNote(id, "Bypass evidence"), /Record follow-up/)
  assert.equal(state.rows[0].status, "new"); assert.equal(state.rows[0].customer_id, null)
})
test("later unanswered contact preserves achieved qualification and its original evidence", async () => {
  const first = await create({ ...follow(), submissionId: input().submissionId }); assert.ok(first.ok); const id = first.id!
  const proof = structuredClone(state.rows[0].metadata.qualification_evidence)
  const later = { ...input(), submissionId: follow().submissionId, channel: "phone", contactResult: "missed", followUpResult: "follow_up", nextAction: "Advisor to call back tomorrow", occurredAt: "2026-10-23T17:00:00+04:00" }
  assert.ok((await followUp(id, later)).ok)
  assert.equal(state.rows[0].status, "qualified")
  assert.deepEqual(state.rows[0].metadata.qualification_evidence, proof)
  assert.equal(state.rows[0].metadata.qualification, follow().qualification)
  assert.equal((await followUp(id, { ...later, submissionId: "e0413409-6d09-459b-a316-b2a230344273", occurredAt: "2026-10-23T14:00:00+04:00" })).ok, false)
})
test("routine received-message follow-up preserves Contacted; changed qualified fault needs reassessment", async () => {
  const first = await create({ ...input(), contactResult: "conversation" }); assert.ok(first.ok); const id = first.id!
  assert.ok((await followUp(id, { ...input(), submissionId: follow().submissionId, occurredAt: "2026-10-23T16:00:00+04:00" })).ok)
  assert.equal(state.rows[0].status, "contacted")
  assert.ok((await followUp(id, { ...follow(), submissionId: "e0413409-6d09-459b-a316-b2a230344273", occurredAt: "2026-10-23T17:00:00+04:00" })).ok)
  const changed = await followUp(id, { ...input(), submissionId: "c08ad7c6-a294-465f-90d3-1bfe7b7faaf3", fault: "Different repair", occurredAt: "2026-10-23T18:00:00+04:00" })
  assert.equal(changed.ok, false); assert.equal(state.rows[0].message, input().fault)
})
test("concurrent deletion cannot be reversed by a stale follow-up", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  const r = await Promise.allSettled([followUp(id, follow()), remove(id)])
  assert.equal(state.rows[0].metadata.manual_revision, 1)
  if (state.rows[0].metadata.deleted_at) assert.equal((state.rows[0].metadata.notes as unknown[]).length, 1)
  else { assert.equal((state.rows[0].metadata.notes as unknown[]).length, 2); assert.equal(r[1].status, "rejected") }
})
test("assignment participates in revision CAS and cannot silently remove follow-up history", async () => {
  const first = await create(input()); assert.ok(first.ok); const id = first.id!
  await Promise.allSettled([followUp(id, follow()), assign(id, null)])
  assert.equal(state.rows[0].metadata.manual_revision, 1)
  assert.equal((state.rows[0].metadata.notes as unknown[]).length === 2 || state.rows[0].metadata.assigned_to === null, true)
})
test("customer conversion and follow-up cannot leave a linked customer in a non-converted status", async () => {
  const first = await create({ ...follow(), submissionId: input().submissionId }); assert.ok(first.ok); const id = first.id!
  await Promise.allSettled([followUp(id, { ...follow(), occurredAt: "2026-10-23T17:00:00+04:00" }), convert(id, { useExistingCustomerId: "existing-customer" })])
  assert.equal(state.rows[0].metadata.manual_revision, 1)
  if (state.rows[0].customer_id) assert.equal(state.rows[0].status, "converted")
  else assert.equal(state.rows[0].status, "qualified")
})
