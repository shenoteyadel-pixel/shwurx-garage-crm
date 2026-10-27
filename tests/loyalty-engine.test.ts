import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const root = new URL("../scripts/", import.meta.url)
const migration = readFileSync(new URL("077_loyalty_rewards.sql", root), "utf8")
const rollback = readFileSync(new URL("077_loyalty_rewards_rollback.sql", root), "utf8")

const OWNER = "00000000-0000-0000-0000-0000000000a1"
const FINANCE = "00000000-0000-0000-0000-0000000000a2"
const ADVISOR = "00000000-0000-0000-0000-0000000000a3"
const TECH = "00000000-0000-0000-0000-0000000000a4"
const CUST = "00000000-0000-0000-0000-0000000000c1"
const DEALER = "00000000-0000-0000-0000-0000000000c2"

/** Minimal production-shaped schema (columns, constraints and RBAC helpers copied from production). */
const baseSchema = `
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean not null default true);
create table public.role_permissions (role text, permission text, allowed boolean not null, updated_at timestamptz default now(), primary key (role, permission));
create table public.permission_overrides (user_id uuid, permission text, allowed boolean);
create function public.auth_role() returns text language sql stable security definer set search_path to '' as $$
  select role from public.profiles where id = auth.uid() and is_active = true $$;
create function public.has_perm(perm text) returns boolean language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then true
  else coalesce((select allowed from public.permission_overrides where user_id = auth.uid() and permission = perm),
    (select rp.allowed from public.role_permissions rp join public.profiles p on p.role = rp.role
      where p.id = auth.uid() and p.is_active = true and rp.permission = perm), false) end $$;
create table public.customers (id uuid primary key default gen_random_uuid(), full_name text not null, mobile text,
  alt_mobile text, whatsapp text, status text not null default 'active', customer_type text not null default 'individual');
create table public.vehicles (id uuid primary key default gen_random_uuid(), customer_id uuid, vin text, mileage integer);
create table public.jobs (id uuid primary key default gen_random_uuid(), job_number text, customer_id uuid, vehicle_id uuid);
create table public.invoices (id uuid primary key default gen_random_uuid(), invoice_number text, job_id uuid,
  status text check (status = any (array['draft','unpaid','partial','paid','cancelled'])), parts_total numeric,
  labour_total numeric, discount numeric, subtotal numeric, vat_rate numeric, vat_amount numeric, total numeric,
  amount_paid numeric default 0, updated_at timestamptz default now());
create table public.invoice_items (id uuid primary key default gen_random_uuid(), invoice_id uuid, kind text,
  description text, quantity numeric, unit_price numeric, line_total numeric, billing_type text default 'normal');
create table public.payments (id uuid primary key default gen_random_uuid(), direction text not null, invoice_id uuid,
  amount numeric not null, method text, reference text, paid_at date, note text, created_by uuid,
  created_at timestamptz default now());
insert into public.profiles (id, full_name, role) values
  ('${OWNER}', 'Owner', 'owner'), ('${FINANCE}', 'Fin', 'finance'),
  ('${ADVISOR}', 'Adv', 'service_advisor'), ('${TECH}', 'Tech', 'technician');
insert into public.role_permissions (role, permission, allowed) values
  ('service_advisor','invoices.view',true), ('finance','invoices.view',true), ('technician','vehicles.view',true);
insert into public.customers (id, full_name, mobile, customer_type) values
  ('${CUST}', 'Ahmed Al Test', '+971 50 123 4567', 'individual'),
  ('${DEALER}', 'Dealer Motors', '+971 55 000 9876', 'dealer');
`

async function freshDb() {
  const db = new PGlite()
  await db.exec(baseSchema)
  await db.exec(migration)
  return db
}

const as = (db: PGlite, uid: string | null) => db.query("select set_config('test.uid', $1, false)", [uid ?? ""])
const one = async <T = any>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]

async function makeInvoice(db: PGlite, customer: string, number: string) {
  const job = await one<{ id: string }>(db, "insert into jobs (job_number, customer_id) values ($1, $2) returning id", [number, customer])
  // parts 800 + labour 200 + fee 50 (excluded) - discount 100 = 950 ex-VAT; VAT 5% = 47.50; total 997.50
  const inv = await one<{ id: string }>(db,
    `insert into invoices (invoice_number, job_id, status, parts_total, labour_total, discount, subtotal, vat_rate, vat_amount, total)
     values ($1, $2, 'unpaid', 850, 200, 100, 950, 5, 47.5, 997.5) returning id`, [number, job.id])
  await db.query(`insert into invoice_items (invoice_id, kind, line_total) values ($1,'part',800),($1,'labour',200),($1,'fee',50)`, [inv.id])
  return inv.id
}

async function enroll(db: PGlite, customer: string, last4: string) {
  await as(db, ADVISOR)
  const token = (await one<{ t: string }>(db, "select loyalty_invite($1) t", [customer])).t
  await as(db, null)
  return { token, result: (await one<{ r: string }>(db, "select loyalty_enroll($1, $2, true) r", [token, last4])).r }
}

const membership = (db: PGlite, customer: string) =>
  one<any>(db, "select * from loyalty_memberships where customer_id = $1", [customer])

async function pay(db: PGlite, invoice: string, amount: number, method = "cash") {
  const p = await one<{ id: string }>(db, "insert into payments (direction, invoice_id, amount, method) values ('in',$1,$2,$3) returning id", [invoice, amount, method])
  return p.id
}

async function enable(db: PGlite, extra = "") {
  await as(db, OWNER)
  await db.query(`update loyalty_rules set program_enabled = true ${extra} where id = 1`)
}

test("migration applies, rolls back cleanly and re-applies", async () => {
  const db = await freshDb()
  await db.exec(rollback)
  const left = await one<{ n: number }>(db, "select count(*)::int n from pg_tables where tablename like 'loyalty%' or tablename in ('wallet_passes','reminder_events')")
  assert.equal(left.n, 0)
  await db.exec(migration)
  assert.equal((await one<{ n: number }>(db, "select count(*)::int n from pg_tables where tablename like 'loyalty%'")).n, 7)
})

test("program disabled by default: payments earn nothing and are never blocked", async () => {
  const db = await freshDb()
  const inv = await makeInvoice(db, CUST, "INV-1")
  assert.equal((await enroll(db, CUST, "4567")).result, "enrolled")
  await pay(db, inv, 997.5)
  assert.equal((await membership(db, CUST)).points_balance, 0)
  assert.equal((await one<{ n: number }>(db, "select count(*)::int n from loyalty_transactions")).n, 0)
})

test("enrollment requires matching mobile digits and locks after 5 failures", async () => {
  const db = await freshDb()
  await as(db, ADVISOR)
  const token = (await one<{ t: string }>(db, "select loyalty_invite($1) t", [CUST])).t
  assert.equal(token.length, 64)
  assert.ok(!token.includes(CUST.replace(/-/g, "")), "token does not embed customer id")
  await as(db, null)
  assert.equal((await one<{ r: string }>(db, "select loyalty_enroll($1,'0000',true) r", [token])).r, "mismatch")
  const look = await one<any>(db, "select * from loyalty_enroll_lookup($1)", [token])
  assert.equal(look.first_name, "Ahmed")
  assert.equal(look.membership_number, null, "number hidden until enrolled")
  for (let i = 0; i < 4; i++) await db.query("select loyalty_enroll($1,'1111',true)", [token])
  assert.equal((await one<{ r: string }>(db, "select loyalty_enroll($1,'4567',true) r", [token])).r, "locked")
})

test("earning: ex-VAT, excluded fee, discount, partial payments, idempotent, cash share only", async () => {
  const db = await freshDb()
  await enable(db)
  const inv = await makeInvoice(db, CUST, "INV-2")
  await enroll(db, CUST, "4567")
  // eligible = 1000 - 100 * 1000/1050 = 904.76 AED
  assert.equal(Number((await one<any>(db, "select loyalty_invoice_eligible_net($1) e", [inv])).e), 904.76)
  const p1 = await pay(db, inv, 498.75)
  assert.equal((await membership(db, CUST)).points_balance, 452)
  await pay(db, inv, 498.75)
  assert.equal((await membership(db, CUST)).points_balance, 904, "split payments sum to floor(904.76)")
  assert.equal((await one<any>(db, "select loyalty_process_payment($1) p", [p1])).p, 0, "replay earns nothing")
  await pay(db, inv, 100)
  assert.equal((await membership(db, CUST)).points_balance, 904, "overpayment earns nothing extra")
  const tx = await one<any>(db, "select expires_at - created_at > interval '364 days' ok from loyalty_transactions where kind='earn' limit 1")
  assert.equal(tx.ok, true, "points expire 12 months after earning")
})

test("tiers: silver multiplier after AED 10,000 rolling spend, and refunds pull tier back", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, CUST, "4567")
  const job = await one<any>(db, "insert into jobs (customer_id) values ($1) returning id", [CUST])
  const big = await one<any>(db, `insert into invoices (invoice_number, job_id, status, discount, subtotal, total)
    values ('INV-BIG', $1, 'unpaid', 0, 10000, 10500) returning id`, [job.id])
  await db.query("insert into invoice_items (invoice_id, kind, line_total) values ($1,'labour',10000)", [big.id])
  await pay(db, big.id, 10500)
  let m = await membership(db, CUST)
  assert.equal(m.points_balance, 10000)
  assert.equal(m.tier, "silver")
  const inv = await makeInvoice(db, CUST, "INV-3")
  await pay(db, inv, 997.5)
  m = await membership(db, CUST)
  assert.equal(m.points_balance, 10000 + Math.floor(904 * 1.25), "1.25x on silver")
  await as(db, FINANCE)
  await db.query("select loyalty_refund_invoice($1, 5250, 'RF-1')", [big.id])
  assert.equal((await one<any>(db, "select loyalty_refund_invoice($1, 5250, 'RF-1') p", [big.id])).p, 0, "refund idempotent")
  m = await membership(db, CUST)
  assert.equal(m.tier, "member")
  assert.equal(m.points_balance, 10000 + 1130 - 5000)
})

test("dealer customers excluded by default; Owner can include them", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, DEALER, "9876")
  const inv = await makeInvoice(db, DEALER, "INV-D1")
  await pay(db, inv, 997.5)
  assert.equal((await membership(db, DEALER)).points_balance, 0)
  await as(db, FINANCE)
  await assert.rejects(db.query("select loyalty_set_earning_override($1, 'include')", [(await membership(db, DEALER)).id]))
  await as(db, OWNER)
  await db.query("select loyalty_set_earning_override($1, 'include')", [(await membership(db, DEALER)).id])
  const inv2 = await makeInvoice(db, DEALER, "INV-D2")
  await pay(db, inv2, 997.5)
  assert.equal((await membership(db, DEALER)).points_balance, 904)
})

test("redemption: min 1,000, max 20%, accounting gate, tender, no double redemption, cancel restores", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, CUST, "4567")
  const job = await one<any>(db, "insert into jobs (customer_id) values ($1) returning id", [CUST])
  const seed = await one<any>(db, `insert into invoices (invoice_number, job_id, status, discount, subtotal, total)
    values ('INV-S', $1, 'unpaid', 0, 5000, 5250) returning id`, [job.id])
  await db.query("insert into invoice_items (invoice_id, kind, line_total) values ($1,'part',5000)", [seed.id])
  await pay(db, seed.id, 5250)
  assert.equal((await membership(db, CUST)).points_balance, 5000)

  const inv = await makeInvoice(db, CUST, "INV-R")
  await as(db, ADVISOR)
  await assert.rejects(db.query("select loyalty_request_redemption($1, 999, 'k0')", [inv]), /Minimum redemption/)
  const lim = await one<any>(db, "select * from loyalty_redemption_limit($1)", [inv])
  assert.equal(lim.max_points, 5000, "capped by balance (20% cap of 904.76 = 18,095 pts is higher)")
  assert.equal(lim.available_points, 5000)
  await assert.rejects(db.query("select loyalty_request_redemption($1, 5001, 'k1')", [inv]), /Maximum/)
  const rid = (await one<any>(db, "select loyalty_request_redemption($1, 1500, 'k2') id", [inv])).id
  assert.equal((await one<any>(db, "select loyalty_request_redemption($1, 1500, 'k2') id", [inv])).id, rid, "idempotent request")
  await assert.rejects(db.query("select loyalty_request_redemption($1, 1500, 'k3')", [inv]), /already has an open redemption/)

  await as(db, ADVISOR)
  await assert.rejects(db.query("select loyalty_decide_redemption($1, true)", [rid]), /Not authorised/)
  await as(db, FINANCE)
  await assert.rejects(db.query("select loyalty_decide_redemption($1, true)", [rid]), /accounting treatment/)
  await as(db, OWNER)
  await db.query("update loyalty_rules set redemption_accounting = 'tender' where id = 1")
  await as(db, FINANCE)
  assert.equal((await one<any>(db, "select loyalty_decide_redemption($1, true) s", [rid])).s, "applied")
  assert.equal((await one<any>(db, "select loyalty_decide_redemption($1, true) s", [rid])).s, "applied", "no double apply")
  let m = await membership(db, CUST)
  assert.equal(m.points_balance, 3500)
  const i = await one<any>(db, "select amount_paid, status, total, vat_amount from invoices where id = $1", [inv])
  assert.deepEqual([Number(i.amount_paid), i.status, Number(i.total), Number(i.vat_amount)], [15, "partial", 997.5, 47.5])
  assert.equal(m.points_balance, 3500, "loyalty tender payment does not earn points")

  await as(db, ADVISOR)
  await db.query("update invoices set status = 'cancelled' where id = $1", [inv])
  m = await membership(db, CUST)
  assert.equal(m.points_balance, 5000, "cancellation restores redeemed points")
  assert.equal((await one<any>(db, "select status from loyalty_redemptions where id = $1", [rid])).status, "reversed")
})

test("cancellation after points were spent records debt, never a negative balance; future earning settles it", async () => {
  const db = await freshDb()
  await enable(db, ", redemption_accounting = 'tender'")
  await enroll(db, CUST, "4567")
  const job = await one<any>(db, "insert into jobs (customer_id) values ($1) returning id", [CUST])
  const a = await one<any>(db, `insert into invoices (invoice_number, job_id, status, discount, subtotal, total)
    values ('INV-A', $1, 'unpaid', 0, 2000, 2100) returning id`, [job.id])
  await db.query("insert into invoice_items (invoice_id, kind, line_total) values ($1,'part',2000)", [a.id])
  await pay(db, a.id, 2100)
  const b = await one<any>(db, `insert into invoices (invoice_number, job_id, status, discount, subtotal, total)
    values ('INV-B', $1, 'unpaid', 0, 10000, 10500) returning id`, [job.id])
  await db.query("insert into invoice_items (invoice_id, kind, line_total) values ($1,'part',10000)", [b.id])
  await as(db, ADVISOR)
  const rid = (await one<any>(db, "select loyalty_request_redemption($1, 1500, 'x') id", [b.id])).id
  await as(db, FINANCE)
  await db.query("select loyalty_decide_redemption($1, true)", [rid])
  assert.equal((await membership(db, CUST)).points_balance, 500)
  await db.query("update invoices set status = 'cancelled' where id = $1", [a.id])
  let m = await membership(db, CUST)
  assert.deepEqual([m.points_balance, m.points_debt], [0, 1500])
  await db.query("update invoices set status = 'cancelled' where id = $1", [a.id])
  await db.query("update invoices set status = 'paid' where id = $1", [a.id])
  await db.query("update invoices set status = 'cancelled' where id = $1", [a.id])
  m = await membership(db, CUST)
  assert.deepEqual([m.points_balance, m.points_debt], [0, 1500], "cancellation reversal runs once")
  const c = await makeInvoice(db, CUST, "INV-C")
  await pay(db, c, 997.5)
  m = await membership(db, CUST)
  assert.deepEqual([m.points_balance, m.points_debt], [0, 1500 - 904])
})

test("deleting a payment reverses its points; expiry removes unspent lots", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, CUST, "4567")
  const inv = await makeInvoice(db, CUST, "INV-E")
  const p = await pay(db, inv, 498.75)
  assert.equal((await membership(db, CUST)).points_balance, 452)
  await db.query("delete from payments where id = $1", [p])
  assert.equal((await membership(db, CUST)).points_balance, 0)
  await pay(db, inv, 997.5)
  assert.equal((await membership(db, CUST)).points_balance, 904, "re-recorded payment earns the full invoice once")
  // Backdate lots via a privileged session to simulate 12 months passing.
  await db.exec("alter table loyalty_transactions disable trigger loyalty_transactions_guard; update loyalty_transactions set expires_at = now() - interval '1 day'; alter table loyalty_transactions enable trigger loyalty_transactions_guard;")
  assert.equal((await one<any>(db, "select loyalty_expire_due() n")).n, 1)
  assert.equal((await one<any>(db, "select loyalty_expire_due() n")).n, 0)
  const m = await membership(db, CUST)
  assert.deepEqual([m.points_balance, Number(m.lifetime_expired)], [0, 904])
})

test("manual adjustments need a second authorised approver; technicians cannot touch balances", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, CUST, "4567")
  const mid = (await membership(db, CUST)).id
  await as(db, TECH)
  await assert.rejects(db.query("select loyalty_request_adjustment($1, 500, 'goodwill credit', 't')", [mid]), /Not authorised/)
  await assert.rejects(db.query("select loyalty_decide_redemption(gen_random_uuid(), true)"), /Not authorised/)
  await as(db, FINANCE)
  const aid = (await one<any>(db, "select loyalty_request_adjustment($1, 500, 'goodwill credit', 'adj1') id", [mid])).id
  await assert.rejects(db.query("select loyalty_decide_adjustment($1, true)", [aid]), /different authorised user/)
  await as(db, OWNER)
  await db.query("select loyalty_decide_adjustment($1, true)", [aid])
  assert.equal((await membership(db, CUST)).points_balance, 500)
  await as(db, FINANCE)
  const neg = (await one<any>(db, "select loyalty_request_adjustment($1, -900, 'correction too big', 'adj2') id", [mid])).id
  await as(db, OWNER)
  await assert.rejects(db.query("select loyalty_decide_adjustment($1, true)", [neg]), /Insufficient points/)
  assert.equal((await membership(db, CUST)).points_balance, 500)
})

test("ledger is immutable and a loyalty failure never blocks a payment", async () => {
  const db = await freshDb()
  await enable(db)
  await enroll(db, CUST, "4567")
  const inv = await makeInvoice(db, CUST, "INV-I")
  await pay(db, inv, 997.5)
  await assert.rejects(db.query("update loyalty_transactions set points = 99999"), /immutable/)
  await assert.rejects(db.query("delete from loyalty_transactions"), /append-only/)
  await db.exec("alter table loyalty_memberships add constraint test_break check (points_balance < 1000)")
  const inv2 = await makeInvoice(db, CUST, "INV-I2")
  await pay(db, inv2, 997.5)
  assert.equal((await one<any>(db, "select count(*)::int n from payments where invoice_id = $1", [inv2])).n, 1, "payment saved")
  assert.equal((await one<any>(db, "select count(*)::int n from loyalty_processing_errors")).n, 1, "error logged")
})

test("invoice summary for documents exposes only an opaque token", async () => {
  const db = await freshDb()
  const inv = await makeInvoice(db, CUST, "INV-Q")
  await as(db, TECH)
  await assert.rejects(db.query("select * from loyalty_invoice_summary($1)", [inv]), /Not authorised/)
  await as(db, ADVISOR)
  const s = await one<any>(db, "select * from loyalty_invoice_summary($1)", [inv])
  assert.equal(s.membership_status, "invited")
  assert.match(s.enroll_token, /^[0-9a-f]{64}$/)
  assert.equal(s.membership_number, null)
})
