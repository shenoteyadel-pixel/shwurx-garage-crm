// Leads page data states with a fake Supabase client (no network) plus rendered notices.
// Run: node --import tsx --test tests/leads-page-data.test.tsx
import { test } from "node:test"
import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { loadLeadsPageData } from "../lib/leads-page-data"
import { LeadsLoadError, StaffListUnavailableNotice } from "../components/leads-load-notice"

type Result = { data: unknown[] | null; error: { code: string; message: string } | null }

function fakeClient(results: { leads: Result; profiles: Result }) {
  const calls: string[] = []
  const client = {
    from(table: "leads" | "profiles") {
      calls.push(table)
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        order: () => q,
        then: (resolve: (v: Result) => void) => resolve(results[table]),
      }
      return q
    },
  }
  return { client: client as unknown as Parameters<typeof loadLeadsPageData>[0], calls }
}

const SECRET = "permission denied for table leads SELECT phone FROM"
const lead = { id: "l1", name: "Lead", status: "new", metadata: {}, created_at: "2026-10-09T15:19:47Z" }
const staffRow = { id: "u1", full_name: "Staff One", email: "s@example.com", role: "reception", is_active: true }
const quiet = <T,>(fn: () => Promise<T>) => {
  const orig = console.error
  const logged: unknown[][] = []
  console.error = (...a: unknown[]) => void logged.push(a)
  return fn().finally(() => (console.error = orig)).then((v) => ({ v, logged }))
}

test("lead query error is an error state, not an empty inbox, and logs only the code", async () => {
  const { client } = fakeClient({
    leads: { data: null, error: { code: "42501", message: SECRET } },
    profiles: { data: [staffRow], error: null },
  })
  const { v, logged } = await quiet(() => loadLeadsPageData(client))
  assert.deepEqual(v, { state: "error" })
  assert.ok(!JSON.stringify(logged).includes(SECRET))

  const html = renderToStaticMarkup(<LeadsLoadError />)
  assert.match(html, /Could not load leads\. Try again\./)
  assert.match(html, /href="\/leads"[^>]*>Retry</)
  assert.match(html, /role="alert"/)
  assert.ok(!html.includes("42501") && !html.includes("No leads yet"))
})

test("true empty result stays the ordinary empty state", async () => {
  const { client, calls } = fakeClient({
    leads: { data: [], error: null },
    profiles: { data: [staffRow], error: null },
  })
  const r = await loadLeadsPageData(client)
  assert.equal(r.state, "empty")
  assert.deepEqual(calls.sort(), ["leads", "profiles"], "same two tables, no added scope")
})

test("success returns lead rows and mapped staff", async () => {
  const { client } = fakeClient({
    leads: { data: [lead], error: null },
    profiles: { data: [staffRow, { id: "u2", full_name: "", email: "", role: "marketing" }], error: null },
  })
  const r = await loadLeadsPageData(client)
  if (r.state !== "list") return assert.fail(`expected list, got ${r.state}`)
  assert.equal(r.leads.length, 1)
  assert.deepEqual(r.staff, [
    { id: "u1", name: "Staff One" },
    { id: "u2", name: "Staff" },
  ])
  assert.equal(r.staffUnavailable, false)
})

test("staff query failure keeps lead rows and flags assignment unavailable", async () => {
  const { client } = fakeClient({
    leads: { data: [lead], error: null },
    profiles: { data: null, error: { code: "42501", message: SECRET } },
  })
  const { v } = await quiet(() => loadLeadsPageData(client))
  if (v.state !== "list") return assert.fail(`expected list, got ${v.state}`)
  assert.equal(v.leads.length, 1)
  assert.deepEqual(v.staff, [])
  assert.equal(v.staffUnavailable, true)

  const html = renderToStaticMarkup(<StaffListUnavailableNotice />)
  assert.match(html, /lead assignment is unavailable/)
  assert.ok(!html.includes("42501"))
})
