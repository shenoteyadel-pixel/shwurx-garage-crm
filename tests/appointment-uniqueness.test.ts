import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { submitOnce, type InsertResult } from "../lib/website/submit-once"

const root = new URL("../scripts/", import.meta.url)
const fixture = readFileSync(new URL("fixtures/intake_rpcs.sql", root), "utf8")
const migration = readFileSync(new URL("060_appointment_submission_unique.sql", root), "utf8")
const rollback = readFileSync(new URL("060_appointment_submission_unique_rollback.sql", root), "utf8")

/** Production submit_appointment definition, extracted verbatim from the read-only fixture. */
function appointmentRpc(): string {
  const start = fixture.indexOf("CREATE OR REPLACE FUNCTION public.submit_appointment")
  const end = fixture.indexOf("$function$;", start) + "$function$;".length
  assert.ok(start >= 0 && end > start, "fixture contains submit_appointment")
  return fixture.slice(start, end)
}

async function freshDb() {
  const db = new PGlite()
  await db.exec(`
    create table public.appointments (
      id uuid primary key default gen_random_uuid(),
      name text, phone text, email text, vehicle_make text, vehicle_model text,
      vehicle_year text, plate_number text, service_interest text, preferred_date date,
      preferred_time text, notes text, source text, metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );`)
  await db.exec(appointmentRpc())
  return db
}

function routeAdapters(db: PGlite, submissionId: string) {
  const find = async (sid: string) => {
    const r = await db.query<{ id: string }>(
      "select id from public.appointments where metadata->>'submission_id' = $1 limit 1",
      [sid],
    )
    return r.rows[0]?.id ?? null
  }
  const insert = async (): Promise<InsertResult> => {
    try {
      const r = await db.query<{ res: { ok: boolean; id?: string; error?: string } }>(
        "select public.submit_appointment($1, $2, p_metadata => $3::jsonb) as res",
        ["Test Customer", "+97100000000", JSON.stringify({ submission_id: submissionId, form_key: "appointment" })],
      )
      const res = r.rows[0].res
      return res.ok && res.id ? { ok: true, id: res.id } : { ok: false, error: res.error ?? "not_persisted" }
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? null, error: "not_persisted" }
    }
  }
  return { find, insert }
}

const SID = "2f1c8a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f"

test("060: simultaneous submits with one submission id persist exactly one appointment", async () => {
  const db = await freshDb()
  await db.exec(migration)
  const { find, insert } = routeAdapters(db, SID)

  // All pre-selects resolve before any insert, so every request but one hits 23505.
  const results = await Promise.all(Array.from({ length: 5 }, () => submitOnce({ submissionId: SID, find, insert })))

  const count = await db.query<{ n: number }>("select count(*)::int as n from public.appointments")
  assert.equal(count.rows[0].n, 1)
  const ids = new Set(results.map((r) => (r.outcome === "error" ? null : r.id)))
  assert.equal(ids.size, 1, "every caller gets the same row id")
  assert.equal(results.filter((r) => r.outcome === "received").length, 1)
  assert.equal(results.filter((r) => r.outcome === "duplicate").length, 4)
  await db.close()
})

test("060: without the index the same race creates duplicates (documents the gap it closes)", async () => {
  const db = await freshDb()
  const { find, insert } = routeAdapters(db, SID)
  await Promise.all(Array.from({ length: 3 }, () => submitOnce({ submissionId: SID, find, insert })))
  const count = await db.query<{ n: number }>("select count(*)::int as n from public.appointments")
  assert.equal(count.rows[0].n, 3)
  await db.close()
})

test("060: pre-check aborts without creating the index when duplicates exist", async () => {
  const db = await freshDb()
  const { insert } = routeAdapters(db, SID)
  await insert()
  await insert()
  await assert.rejects(db.exec(migration), /duplicated submission_id/)
  await db.exec("rollback").catch(() => {})
  const idx = await db.query("select 1 from pg_indexes where indexname = 'appointments_submission_id_uniq'")
  assert.equal(idx.rows.length, 0)
  await db.close()
})

test("060: rows without a submission id are unaffected, and rollback drops the index", async () => {
  const db = await freshDb()
  await db.exec(migration)
  await db.query("select public.submit_appointment('A', '1')")
  await db.query("select public.submit_appointment('B', '2')")
  const count = await db.query<{ n: number }>("select count(*)::int as n from public.appointments")
  assert.equal(count.rows[0].n, 2)
  await db.exec(rollback)
  const idx = await db.query("select 1 from pg_indexes where indexname = 'appointments_submission_id_uniq'")
  assert.equal(idx.rows.length, 0)
  await db.close()
})

test("060: explicit JSON null submission ids pass the pre-check, are preserved, and replay cleanly", async () => {
  const db = await freshDb()
  const nullMeta = JSON.stringify({ submission_id: null, form_key: "appointment" })
  await db.query("select public.submit_appointment('A', '1', p_metadata => $1::jsonb)", [nullMeta])
  await db.query("select public.submit_appointment('B', '2', p_metadata => $1::jsonb)", [nullMeta])

  await db.exec(migration)
  const idx = await db.query("select 1 from pg_indexes where indexname = 'appointments_submission_id_uniq'")
  assert.equal(idx.rows.length, 1)

  await db.query("select public.submit_appointment('C', '3', p_metadata => $1::jsonb)", [nullMeta])
  await db.exec(migration)

  const nulls = await db.query<{ n: number }>(
    "select count(*)::int as n from public.appointments where metadata ? 'submission_id' and metadata->>'submission_id' is null",
  )
  assert.equal(nulls.rows[0].n, 3, "all JSON-null rows are kept")

  const { insert } = routeAdapters(db, SID)
  assert.equal((await insert()).ok, true)
  assert.equal((await insert()).ok, false, "real ids remain unique after replay")
  await db.close()
})

test("submitOnce: a non-unique insert failure is reported, not masked as duplicate", async () => {
  const r = await submitOnce({
    submissionId: SID,
    find: async () => null,
    insert: async () => ({ ok: false, code: "23502", error: "not_persisted" }),
  })
  assert.deepEqual(r, { outcome: "error", error: "not_persisted" })
})
