// Runs the REAL /api/public/enquiry handler with its I/O boundaries stubbed.
// Requires: node --import ./tests/helpers/server-only-shim.mjs --import tsx --experimental-test-module-mocks --test
import { test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { seedDocument } from "../lib/website/seed"
import type { WebsiteDocument } from "../lib/website/types"

const root = path.resolve(__dirname, "..")
const url = (p: string) => pathToFileURL(path.join(root, p)).href

process.env.CONVERSION_TOKEN_SECRET = "test-secret"

type Row = { id: string; submissionId: string; metadata: Record<string, unknown> }
const s = {
  dryRun: false,
  dryRunCalls: 0,
  doc: null as WebsiteDocument | null,
  docReads: 0,
  rows: [] as Row[],
  lookups: 0,
  rateQueries: 0,
  rpcCalls: 0,
  raceOnRpc: false,
  notifications: 0,
}

mock.module(url("lib/supabase/server.ts"), {
  namedExports: {
    createServiceClient: () => ({
      from: () => {
        let sub: string | null = null
        let head = false
        const q = {
          select: (_c: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
          eq: (c: string, v: string) => (c === "metadata->>submission_id" && (sub = v), q),
          gte: () => q,
          maybeSingle: async () => {
            s.lookups++
            const row = s.rows.find((r) => r.submissionId === sub)
            return { data: row ? { id: row.id } : null }
          },
          then: (resolve: (v: unknown) => void) => {
            if (head) s.rateQueries++
            resolve({ count: 0 })
          },
        }
        return q
      },
      rpc: async (_fn: string, args: { p_metadata: Record<string, unknown> }) => {
        s.rpcCalls++
        const id = `lead-${s.rows.length + 1}`
        s.rows.push({ id, submissionId: args.p_metadata.submission_id as string, metadata: args.p_metadata })
        if (s.raceOnRpc) return { data: null, error: { code: "23505" } }
        return { data: { ok: true, id }, error: null }
      },
    }),
    createClient: async () => ({}),
  },
})
mock.module(url("lib/actions-notifications.ts"), {
  namedExports: { notifyByPermission: async () => void s.notifications++ },
})
mock.module(url("lib/website/intake-guard.ts"), {
  namedExports: {
    intakeIsDryRun: async () => (s.dryRunCalls++, s.dryRun),
    readBoundedJson: async (r: Request) => r.json().catch(() => null),
    normalizePhone: (p: string) => p.replace(/\D/g, ""),
  },
})
mock.module(url("lib/website/store.ts"), {
  namedExports: {
    getPublishedDocumentStrict: async () => (s.docReads++, s.doc),
  },
})

let POST: (r: Request) => Promise<Response>
before(async () => {
  POST = (await import("../app/api/public/enquiry/route")).POST
})

const catalogue = seedDocument()
const brand = catalogue.brands.find((b) => b.visible && catalogue.services.some((x) => x.visible && b.serviceSlugs.includes(x.slug)))!
const service = catalogue.services.find((x) => x.visible && brand.serviceSlugs.includes(x.slug))!
const SUB = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"

const valid = () => ({
  submissionId: SUB,
  startedAt: Date.now() - 10_000,
  website: "",
  formKey: "enquiry",
  context: `brand-${brand.slug}`,
  locale: "en",
  name: "QA Tester",
  phone: "+971 50 123 4567",
  brand: brand.slug,
  model: "911",
  year: "2019",
  service: service.slug,
  details: "",
  submitPath: `/brands/${brand.slug}`,
})

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new Request("https://www.swurxauto.com/api/public/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.swurxauto.com" },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

const hide = () => {
  s.doc!.brands.find((b) => b.slug === brand.slug)!.visible = false
}

beforeEach(() => {
  Object.assign(s, {
    dryRun: false,
    dryRunCalls: 0,
    doc: structuredClone(catalogue),
    docReads: 0,
    rows: [],
    lookups: 0,
    rateQueries: 0,
    rpcCalls: 0,
    raceOnRpc: false,
    notifications: 0,
  })
})

test("retry after brand is hidden returns the same id/token without catalogue read, write, rate-limit or alert", async () => {
  const first = await post(valid())
  assert.equal(first.status, 200)
  assert.equal(first.json.outcome, "received")
  const metadataBefore = structuredClone(s.rows[0].metadata)

  const visibleRetry = await post(valid())
  assert.equal(visibleRetry.json.outcome, "duplicate")
  assert.equal(visibleRetry.json.id, first.json.id)

  hide()
  const reads = s.docReads
  const rates = s.rateQueries
  const retry = await post(valid())
  assert.equal(retry.status, 200)
  assert.equal(retry.json.outcome, "duplicate")
  assert.equal(retry.json.id, first.json.id)
  assert.equal(retry.json.conversionToken, first.json.conversionToken)
  assert.equal(s.docReads, reads, "duplicate answered before reading the published document")
  assert.equal(s.rateQueries, rates, "duplicate does not touch rate limiting")
  assert.equal(s.rpcCalls, 1)
  assert.equal(s.notifications, 1)
  assert.deepEqual(s.rows[0].metadata, metadataBefore, "original metadata preserved")
})

test("existing duplicate survives unavailable document and disabled form", async () => {
  s.rows.push({ id: "lead-x", submissionId: SUB, metadata: {} })
  s.doc = null
  const a = await post(valid())
  assert.equal(a.status, 200)
  assert.equal(a.json.outcome, "duplicate")
  assert.equal(a.json.id, "lead-x")

  s.doc = structuredClone(catalogue)
  s.doc.forms.enquiry.enabled = false
  const b = await post(valid())
  assert.equal(b.status, 200)
  assert.equal(b.json.id, "lead-x")
  assert.equal(s.docReads, 0)
  assert.equal(s.rpcCalls, 0)
})

test("NEW request keeps full catalogue validation: hidden brand 400, unavailable doc 503, no write", async () => {
  hide()
  const r = await post(valid())
  assert.equal(r.status, 400)
  assert.equal(r.json.outcome, "invalid")
  assert.deepEqual((r.json.fields as Record<string, string>).brand, "unknown")

  s.doc = null
  const u = await post(valid())
  assert.equal(u.status, 503)
  assert.equal(s.rpcCalls, 0)
  assert.equal(s.notifications, 0)
})

test("guards and basic validation run before the duplicate lookup", async () => {
  s.rows.push({ id: "lead-x", submissionId: SUB, metadata: {} })
  const cases: [Record<string, unknown>, number][] = [
    [{ ...valid(), website: "http://spam" }, 400],
    [{ ...valid(), startedAt: Date.now() }, 400],
    [{ ...valid(), submissionId: "nope" }, 400],
    [{ ...valid(), name: 123 }, 400],
    [{ ...valid(), name: "Q" }, 400],
    [{ ...valid(), phone: "12" }, 400],
    [{ ...valid(), year: "20190" }, 400],
  ]
  for (const [body, status] of cases) {
    const r = await post(body)
    assert.equal(r.status, status, JSON.stringify(body))
    assert.notEqual(r.json.outcome, "duplicate")
  }
  assert.equal(s.lookups, 0)
})

test("preview: validated against the catalogue, never reads real records or returns a real id", async () => {
  s.rows.push({ id: "real-lead", submissionId: SUB, metadata: {} })
  s.dryRun = true
  const ok = await post(valid())
  assert.equal(ok.status, 200)
  assert.equal(ok.json.outcome, "dry_run")
  assert.equal(ok.json.id, null)
  assert.equal(ok.json.conversionToken, undefined)
  assert.equal(s.dryRunCalls, 1, "dry-run determined once per request")

  hide()
  const bad = await post(valid())
  assert.equal(bad.status, 400)
  assert.equal(s.lookups, 0)
  assert.equal(s.rpcCalls, 0)
  assert.equal(s.notifications, 0)
})

test("unique-violation race still recovers to the raced duplicate", async () => {
  s.raceOnRpc = true
  const r = await post(valid())
  assert.equal(r.status, 200)
  assert.equal(r.json.outcome, "duplicate")
  assert.equal(r.json.id, "lead-1")
  assert.equal(s.notifications, 0)
  assert.equal(s.dryRunCalls, 1)
})
