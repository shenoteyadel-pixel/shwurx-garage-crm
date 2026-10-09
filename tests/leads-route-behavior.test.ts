// Runs the REAL /api/public/leads handler with its I/O boundaries stubbed.
// Requires: node --import ./tests/helpers/server-only-shim.mjs --import tsx --experimental-test-module-mocks --test
import { test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { seedDocument, HOME_TITLE } from "../lib/website/seed"
import { homeAwareTitle } from "../lib/website/page-title"
import type { WebsiteDocument } from "../lib/website/types"

const root = path.resolve(__dirname, "..")
const url = (p: string) => pathToFileURL(path.join(root, p)).href
const src = (p: string) => readFileSync(path.join(root, p), "utf8")

process.env.CONVERSION_TOKEN_SECRET = "test-secret"

type State = {
  dryRun: boolean
  doc: WebsiteDocument | null
  docThrows: boolean
  rows: { id: string; submissionId: string | null; metadata: Record<string, unknown> }[]
  rpcCalls: number
  lookups: number
  notifications: number
}
const s: State = { dryRun: false, doc: null, docThrows: false, rows: [], rpcCalls: 0, lookups: 0, notifications: 0 }

mock.module(url("lib/supabase/server.ts"), {
  namedExports: {
    createServiceClient: () => ({
      from: () => {
        let sub: string | null = null
        const q = {
          select: () => q,
          eq: (_c: string, v: string) => ((sub = v), q),
          limit: () => q,
          maybeSingle: async () => {
            s.lookups++
            const row = s.rows.find((r) => r.submissionId === sub)
            return { data: row ? { id: row.id } : null }
          },
        }
        return q
      },
      rpc: async (_fn: string, args: { p_metadata: Record<string, unknown> }) => {
        s.rpcCalls++
        const id = `lead-${s.rows.length + 1}`
        s.rows.push({ id, submissionId: (args.p_metadata.submission_id as string) ?? null, metadata: args.p_metadata })
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
    intakeIsDryRun: async () => s.dryRun,
    readBoundedJson: async (r: Request) => r.json().catch(() => null),
  },
})
mock.module(url("lib/website/store.ts"), {
  namedExports: {
    getPublishedDocumentStrict: async () => {
      if (s.docThrows) throw new Error("db down")
      return s.doc
    },
  },
})

let POST: (r: Request) => Promise<Response>
before(async () => {
  POST = (await import("../app/api/public/leads/route")).POST
})

const catalogue = seedDocument()
const brand = catalogue.brands.find((b) => b.visible && b.serviceSlugs.length)!
const service = catalogue.services.find((x) => x.visible && brand.serviceSlugs.includes(x.slug))!
const SUB = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new Request("https://www.swurxauto.com/api/public/leads", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.swurxauto.com" },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  Object.assign(s, { dryRun: false, doc: structuredClone(catalogue), docThrows: false, rows: [], rpcCalls: 0, lookups: 0, notifications: 0 })
})

test("response-loss retry after brand/service is hidden returns the same id, no extra write or alert", async () => {
  const body = { email: "a@example.com", brand: brand.slug, service: service.slug, model: "X5", year: "2021", submissionId: SUB }
  const first = await post(body)
  assert.equal(first.status, 200)
  assert.equal(first.json.outcome, "received")
  assert.equal(s.rows[0].metadata.brand_slug, brand.slug)
  assert.equal(s.rows[0].metadata.service_slug, service.slug)

  // Owner hides both selections after the first request was received.
  s.doc!.brands.find((b) => b.slug === brand.slug)!.visible = false
  s.doc!.services.find((x) => x.slug === service.slug)!.visible = false

  const retry = await post(body)
  assert.equal(retry.status, 200)
  assert.equal(retry.json.outcome, "duplicate")
  assert.equal(retry.json.id, first.json.id)
  assert.equal(retry.json.conversionToken, first.json.conversionToken, "same opaque token for dedup")
  assert.equal(s.rpcCalls, 1, "no second write / metadata rewrite")
  assert.equal(s.notifications, 1, "no second staff alert")
})

test("a NEW request with a hidden brand is still rejected 400 with no write", async () => {
  s.doc!.brands.find((b) => b.slug === brand.slug)!.visible = false
  const r = await post({ email: "a@example.com", brand: brand.slug, submissionId: SUB })
  assert.equal(r.status, 400)
  assert.equal(r.json.error, "invalid_vehicle")
  assert.equal(s.rpcCalls, 0)
  assert.equal(s.notifications, 0)
})

test("selected brand/service with catalogue unavailable: 503, no write/alert/token", async () => {
  for (const mode of ["null", "throws"] as const) {
    s.doc = null
    s.docThrows = mode === "throws"
    for (const sel of [{ brand: brand.slug }, { service: service.slug }]) {
      const r = await post({ email: "a@example.com", ...sel, submissionId: SUB })
      assert.equal(r.status, 503, `${mode} ${JSON.stringify(sel)}`)
      assert.equal(r.json.outcome, "unavailable")
      assert.equal(r.json.error, "catalogue_unavailable")
      assert.equal(r.json.id, undefined)
      assert.equal(r.json.conversionToken, undefined)
    }
  }
  assert.equal(s.rpcCalls, 0)
  assert.equal(s.notifications, 0)
})

test("503 unavailable is distinct from 400 invalid (bad slug shape stays 400 even without catalogue)", async () => {
  s.doc = null
  const r = await post({ email: "a@example.com", brand: "NOT A SLUG!" })
  assert.equal(r.status, 400)
  assert.equal(r.json.outcome, "invalid")
})

test("catalogue unavailable: generic email-only Contact and model/year-only stay valid", async () => {
  s.doc = null
  s.docThrows = true
  const a = await post({ email: "a@example.com", message: "Hello" })
  assert.equal(a.status, 200)
  assert.equal(a.json.outcome, "received")
  const b = await post({ email: "b@example.com", model: "Other", year: " ٢٠٢٢ " })
  assert.equal(b.status, 200)
  assert.equal(s.rows[1].metadata.vehicle_year, 2022)
  assert.equal(s.rows[1].metadata.brand_slug, null)
  assert.equal(s.rpcCalls, 2)
})

test("preview: fully validated, never looks up or creates records, never returns a real id", async () => {
  s.rows.push({ id: "real-lead-1", submissionId: SUB, metadata: {} })
  s.dryRun = true
  const ok = await post({ email: "a@example.com", brand: brand.slug, service: service.slug, submissionId: SUB })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.outcome, "dry_run")
  assert.equal(ok.json.id, null)
  assert.equal(ok.json.conversionToken, undefined)

  s.doc = null
  const down = await post({ email: "a@example.com", brand: brand.slug, submissionId: SUB })
  assert.equal(down.status, 503, "preview mirrors production validation")

  s.doc = structuredClone(catalogue)
  const bad = await post({ email: "a@example.com", brand: "unknown-brand" })
  assert.equal(bad.status, 400)
  assert.equal(s.lookups, 0, "preview never reads real records")
  assert.equal(s.rpcCalls, 0)
  assert.equal(s.notifications, 0)
})

test("basic validation still precedes the duplicate fast-path", async () => {
  s.rows.push({ id: "real-lead-1", submissionId: SUB, metadata: {} })
  const r = await post({ phone: "+971 50 123 4567 8888888888888", submissionId: SUB })
  assert.equal(r.status, 400)
  const none = await post({ submissionId: SUB })
  assert.equal(none.status, 400)
  assert.equal(s.lookups, 0)
})

test("Contact conversion carries only controlled brand/service slugs", () => {
  const f = src("components/site/contact-form.tsx")
  const call = f
    .slice(f.indexOf("emitConversion("), f.indexOf("})", f.indexOf("emitConversion(")))
    .replace(/\/\/.*$/gm, "")
  const keys = [...call.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort()
  assert.deepEqual(keys, ["brand", "form", "formContext", "outcome", "service", "token"])
  assert.match(call, /brand: brand \|\| null/)
  assert.match(call, /service: service \|\| null/)
  assert.ok(f.indexOf('result.outcome === "dry_run"') < f.indexOf("emitConversion("), "only after a durable outcome")
  assert.ok(!/model|name|email|phone|message/.test(call))
})

test("footer legal name is the shared LEGAL_NAME; licence/TRN unchanged", () => {
  const f = src("components/site/site-footer.tsx")
  assert.match(f, /import \{ LEGAL_NAME \} from "@\/lib\/website\/structured-data"/)
  assert.ok(!f.includes("AUTOMOTIVE CENTER"))
  assert.match(f, /const TRADE_LICENSE = "1033544"/)
  assert.match(f, /const TRN = "10044045860003"/)
})

test("home title suffix is not duplicated; other pages and brand-less home titles keep the suffix", () => {
  assert.equal(homeAwareTitle(HOME_TITLE.en, " | SHWURX", "/"), HOME_TITLE.en)
  assert.equal(homeAwareTitle(HOME_TITLE.ar, " | شوركس", "/"), HOME_TITLE.ar)
  assert.equal(homeAwareTitle("Best garage in Dubai", " | SHWURX", "/"), "Best garage in Dubai | SHWURX")
  assert.equal(homeAwareTitle("SHWURX BMW repair", " | SHWURX", "/brands/bmw"), "SHWURX BMW repair | SHWURX")
  assert.equal(homeAwareTitle("Contact", " | SHWURX", "/contact"), "Contact | SHWURX")
  assert.equal(homeAwareTitle("Home", "", "/"), "Home")
})
