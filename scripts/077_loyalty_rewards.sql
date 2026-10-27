-- 077_loyalty_rewards.sql
-- SWURX Digital Loyalty Rewards & Wallet: schema + transaction engine.
-- Additive only: creates new tables/functions/triggers and inserts new role_permissions rows.
-- No existing rows are modified. The program ships DISABLED (loyalty_rules.program_enabled = false).
--
-- ROUNDING POLICY (all point values are integers):
--   1. Eligible spend is computed ex-VAT in AED, rounded to 2 decimals (fils).
--   2. Partial payments earn on the cumulative paid share: eligible_cum = eligible_net * paid_cum / invoice_total.
--      Base points for a payment = floor(eligible_cum_after * rate) - floor(eligible_cum_before * rate),
--      so the sum over any split of payments equals floor(eligible_net * rate) for a fully paid invoice.
--   3. Tier multiplier is applied per transaction: points = floor(base_points * multiplier_bp / 100).
--   4. Redemption value = floor(points * 100 / points_per_aed) / 100 AED (100 points = AED 1.00 exactly).
--   5. Reversals reverse exactly the points previously earned (no re-rounding).

begin;

-- ---------------------------------------------------------------- helpers
create or replace function public.loyalty_random_token()
returns text language sql volatile set search_path to '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- ---------------------------------------------------------------- rules
create table if not exists public.loyalty_rules (
  id smallint primary key default 1 check (id = 1),
  program_enabled boolean not null default false,
  earn_points_per_aed integer not null default 1 check (earn_points_per_aed between 0 and 100),
  points_per_aed_redeemed integer not null default 100 check (points_per_aed_redeemed > 0),
  min_redeem_points integer not null default 1000 check (min_redeem_points >= 0),
  max_redeem_pct numeric(5,2) not null default 20 check (max_redeem_pct between 0 and 100),
  expiry_months integer not null default 12 check (expiry_months between 1 and 120),
  silver_threshold_aed numeric(12,2) not null default 10000,
  vip_threshold_aed numeric(12,2) not null default 30000,
  member_multiplier_bp integer not null default 100 check (member_multiplier_bp between 0 and 1000),
  silver_multiplier_bp integer not null default 125 check (silver_multiplier_bp between 0 and 1000),
  vip_multiplier_bp integer not null default 150 check (vip_multiplier_bp between 0 and 1000),
  excluded_item_kinds text[] not null default '{fee}',
  excluded_customer_types text[] not null default '{dealer}',
  excluded_payment_methods text[] not null default '{loyalty_points}',
  discount_treatment text not null default 'reduce_eligible'
    check (discount_treatment in ('reduce_eligible', 'ignore')),
  redemption_accounting text not null default 'pending_review'
    check (redemption_accounting in ('pending_review', 'tender')),
  retro_award_days integer not null default 30 check (retro_award_days between 0 and 365),
  reminder_offsets_days integer[] not null default '{30,14,7}',
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '09:00',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (vip_threshold_aed > silver_threshold_aed and silver_threshold_aed > 0)
);
insert into public.loyalty_rules (id) values (1) on conflict (id) do nothing;

create table if not exists public.loyalty_rule_changes (
  id bigint generated always as identity primary key,
  changed_by uuid,
  old_rules jsonb not null,
  new_rules jsonb not null,
  changed_at timestamptz not null default now()
);

create or replace function public.loyalty_rules_audit()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.loyalty_rule_changes (changed_by, old_rules, new_rules)
  values (auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end $$;
drop trigger if exists loyalty_rules_audit on public.loyalty_rules;
create trigger loyalty_rules_audit before update on public.loyalty_rules
  for each row execute function public.loyalty_rules_audit();

-- ---------------------------------------------------------------- memberships
create sequence if not exists public.loyalty_membership_seq start 100001;

create table if not exists public.loyalty_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  membership_number text not null unique default ('SWX' || nextval('public.loyalty_membership_seq')::text),
  enroll_token text not null unique default public.loyalty_random_token(),
  barcode_token text not null unique default public.loyalty_random_token(),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'closed')),
  tier text not null default 'member' check (tier in ('member', 'silver', 'vip')),
  rolling_spend_aed numeric(12,2) not null default 0,
  tier_updated_at timestamptz,
  points_balance integer not null default 0 check (points_balance >= 0),
  points_debt integer not null default 0 check (points_debt >= 0),
  lifetime_earned bigint not null default 0,
  lifetime_redeemed bigint not null default 0,
  lifetime_expired bigint not null default 0,
  lifetime_reversed bigint not null default 0,
  earning_override text check (earning_override in ('include', 'exclude')),
  enroll_failed_attempts integer not null default 0,
  invited_at timestamptz not null default now(),
  invited_by uuid,
  enrolled_at timestamptz,
  enrolled_via text,
  updated_at timestamptz not null default now()
);
create index if not exists loyalty_memberships_status_idx on public.loyalty_memberships (status);

-- ---------------------------------------------------------------- ledger (immutable)
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.loyalty_memberships(id) on delete restrict,
  kind text not null check (kind in ('earn', 'earn_reversal', 'redeem', 'redeem_reversal', 'expire', 'adjust')),
  points integer not null,
  balance_after integer not null check (balance_after >= 0),
  debt_after integer not null default 0 check (debt_after >= 0),
  -- invoice/payment ids are kept without FKs so the audit trail survives deletion of source records
  invoice_id uuid,
  payment_id uuid,
  redemption_id uuid,
  adjustment_id uuid,
  source_lot_id uuid,
  payment_amount numeric(12,2),
  eligible_aed numeric(12,2),
  multiplier_bp integer,
  tier text,
  expires_at timestamptz,
  remaining_points integer check (remaining_points >= 0),
  idempotency_key text not null unique,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (points <> 0 or kind = 'earn')
);
create index if not exists loyalty_tx_membership_idx on public.loyalty_transactions (membership_id, created_at desc);
create index if not exists loyalty_tx_invoice_idx on public.loyalty_transactions (invoice_id) where invoice_id is not null;
create index if not exists loyalty_tx_open_lots_idx on public.loyalty_transactions (membership_id, expires_at)
  where remaining_points > 0;
create index if not exists loyalty_tx_expiry_idx on public.loyalty_transactions (expires_at) where remaining_points > 0;

create or replace function public.loyalty_transactions_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'loyalty_transactions is append-only';
  end if;
  if (to_jsonb(new) - 'remaining_points') <> (to_jsonb(old) - 'remaining_points')
     or new.remaining_points is null or old.remaining_points is null
     or new.remaining_points > old.remaining_points then
    raise exception 'loyalty_transactions is immutable (only open-lot consumption is allowed)';
  end if;
  return new;
end $$;
drop trigger if exists loyalty_transactions_guard on public.loyalty_transactions;
create trigger loyalty_transactions_guard before update or delete on public.loyalty_transactions
  for each row execute function public.loyalty_transactions_guard();

-- ---------------------------------------------------------------- redemptions & adjustments
create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.loyalty_memberships(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  points integer not null check (points > 0),
  value_aed numeric(12,2) not null check (value_aed > 0),
  status text not null default 'requested' check (status in ('requested', 'applied', 'rejected', 'cancelled', 'reversed')),
  payment_id uuid,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text not null unique
);
create unique index if not exists loyalty_redemptions_one_open_per_invoice
  on public.loyalty_redemptions (invoice_id) where status in ('requested', 'applied');
create index if not exists loyalty_redemptions_membership_idx on public.loyalty_redemptions (membership_id, requested_at desc);

create table if not exists public.loyalty_adjustments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.loyalty_memberships(id) on delete restrict,
  points integer not null check (points <> 0),
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  idempotency_key text not null unique,
  check (decided_by is null or decided_by <> requested_by)
);

create table if not exists public.loyalty_processing_errors (
  id bigint generated always as identity primary key,
  source text not null,
  ref_id uuid,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- wallet
create table if not exists public.wallet_passes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.loyalty_memberships(id) on delete cascade,
  platform text not null check (platform in ('apple', 'google')),
  serial_number text not null unique default public.loyalty_random_token(),
  auth_token_hash text,
  google_object_id text unique,
  status text not null default 'pending' check (status in ('pending', 'issued', 'revoked')),
  last_pushed_balance integer,
  last_pushed_tier text,
  needs_update boolean not null default false,
  issued_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (membership_id, platform)
);
create index if not exists wallet_passes_needs_update_idx on public.wallet_passes (needs_update) where needs_update;

-- ---------------------------------------------------------------- consent & preferences
create table if not exists public.customer_notification_preferences (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  whatsapp_service_reminders boolean not null default false,
  whatsapp_loyalty_updates boolean not null default false,
  consent_source text,
  consent_at timestamptz,
  consent_by uuid,
  opted_out_at timestamptz,
  opt_out_reason text,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Dubai',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- service reminders
create table if not exists public.vehicle_service_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_code text not null,
  description text not null,
  interval_km integer check (interval_km > 0),
  interval_months integer check (interval_months > 0),
  last_service_date date,
  last_service_mileage integer,
  last_job_id uuid references public.jobs(id) on delete set null,
  due_date date,
  due_mileage integer,
  mileage_reliable boolean not null default false,
  schedule_source text not null default 'default' check (schedule_source in ('manufacturer', 'default', 'manual')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'superseded', 'cancelled')),
  completed_job_id uuid references public.jobs(id) on delete set null,
  booked_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vehicle_service_schedules_one_open
  on public.vehicle_service_schedules (vehicle_id, service_code) where status = 'scheduled';
create index if not exists vehicle_service_schedules_due_idx
  on public.vehicle_service_schedules (due_date) where status = 'scheduled';

create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.vehicle_service_schedules(id) on delete cascade,
  offset_days integer not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'skipped', 'cancelled', 'failed')),
  attempts integer not null default 0,
  skip_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (schedule_id, offset_days)
);
create index if not exists reminder_events_due_idx on public.reminder_events (scheduled_for) where status = 'pending';

create table if not exists public.reminder_delivery_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.reminder_events(id) on delete cascade,
  channel text not null default 'whatsapp',
  attempt integer not null,
  status text not null check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  provider_message_id text,
  template_name text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists reminder_delivery_logs_event_idx on public.reminder_delivery_logs (event_id, created_at desc);

-- ---------------------------------------------------------------- permissions (new rows only)
insert into public.role_permissions (role, permission, allowed) values
  ('owner', 'loyalty.view', true), ('general_manager', 'loyalty.view', true),
  ('finance', 'loyalty.view', true), ('service_advisor', 'loyalty.view', true),
  ('reception', 'loyalty.view', true),
  ('general_manager', 'loyalty.redeem_request', true), ('service_advisor', 'loyalty.redeem_request', true),
  ('owner', 'loyalty.approve', true), ('finance', 'loyalty.approve', true),
  ('owner', 'loyalty.finance', true), ('finance', 'loyalty.finance', true),
  ('owner', 'loyalty.adjust_request', true), ('general_manager', 'loyalty.adjust_request', true),
  ('finance', 'loyalty.adjust_request', true)
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------- core engine (internal)
create or replace function public._loyalty_log_error(p_source text, p_ref uuid, p_message text)
returns void language sql security definer set search_path to '' as $$
  insert into public.loyalty_processing_errors (source, ref_id, message) values (p_source, p_ref, p_message)
$$;

create or replace function public._loyalty_flag_wallet(p_membership uuid)
returns void language sql security definer set search_path to '' as $$
  update public.wallet_passes set needs_update = true, updated_at = now()
  where membership_id = p_membership and status = 'issued'
$$;

create or replace function public._loyalty_credit(
  p_membership uuid, p_kind text, p_points integer, p_key text, p_expires timestamptz,
  p_invoice uuid default null, p_payment uuid default null, p_redemption uuid default null,
  p_adjustment uuid default null, p_payment_amount numeric default null, p_eligible numeric default null,
  p_multiplier integer default null, p_reason text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  settle integer;
  net integer;
  tx uuid;
begin
  select * into m from public.loyalty_memberships where id = p_membership for update;
  settle := least(m.points_debt, p_points);
  net := p_points - settle;
  insert into public.loyalty_transactions (
    membership_id, kind, points, balance_after, debt_after, invoice_id, payment_id, redemption_id,
    adjustment_id, payment_amount, eligible_aed, multiplier_bp, tier, expires_at, remaining_points,
    idempotency_key, reason, created_by)
  values (
    m.id, p_kind, p_points, m.points_balance + net, m.points_debt - settle, p_invoice, p_payment, p_redemption,
    p_adjustment, p_payment_amount, p_eligible, p_multiplier, m.tier, p_expires, net,
    p_key, coalesce(p_reason, case when settle > 0 then settle || ' pts settled outstanding reversal debt' end),
    auth.uid())
  returning id into tx;
  update public.loyalty_memberships set
    points_balance = points_balance + net,
    points_debt = points_debt - settle,
    lifetime_earned = lifetime_earned + case when p_kind = 'earn' then p_points else 0 end,
    updated_at = now()
  where id = m.id;
  perform public._loyalty_flag_wallet(m.id);
  return tx;
end $$;

-- Debits points from open lots. p_prefer_invoice consumes that invoice's lots first;
-- p_lot restricts consumption to a single lot (expiry). Shortfall becomes debt only when allowed.
create or replace function public._loyalty_debit(
  p_membership uuid, p_kind text, p_points integer, p_key text, p_allow_debt boolean,
  p_invoice uuid default null, p_payment uuid default null, p_redemption uuid default null,
  p_adjustment uuid default null, p_lot uuid default null, p_payment_amount numeric default null,
  p_eligible numeric default null, p_reason text default null
) returns uuid language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  need integer;
  take integer;
  shortfall integer;
  lot record;
  tx uuid;
begin
  if p_points <= 0 then raise exception 'debit must be positive'; end if;
  select * into m from public.loyalty_memberships where id = p_membership for update;
  take := least(p_points, m.points_balance);
  shortfall := p_points - take;
  if shortfall > 0 and not p_allow_debt then
    raise exception 'Insufficient points: balance %, requested %', m.points_balance, p_points
      using errcode = 'P0001';
  end if;
  need := take;
  for lot in
    select id, remaining_points from public.loyalty_transactions
    where membership_id = m.id and remaining_points > 0 and (p_lot is null or id = p_lot)
    order by (case when p_invoice is not null and invoice_id = p_invoice then 0 else 1 end), expires_at nulls last, created_at
    for update
  loop
    exit when need = 0;
    update public.loyalty_transactions
      set remaining_points = remaining_points - least(need, lot.remaining_points)
      where id = lot.id;
    need := need - least(need, lot.remaining_points);
  end loop;
  if need > 0 then raise exception 'Lot balance mismatch for membership %', m.id; end if;
  insert into public.loyalty_transactions (
    membership_id, kind, points, balance_after, debt_after, invoice_id, payment_id, redemption_id,
    adjustment_id, source_lot_id, payment_amount, eligible_aed, tier, idempotency_key, reason, created_by)
  values (
    m.id, p_kind, -p_points, m.points_balance - take, m.points_debt + shortfall, p_invoice, p_payment,
    p_redemption, p_adjustment, p_lot, p_payment_amount, p_eligible, m.tier, p_key,
    coalesce(p_reason, case when shortfall > 0 then shortfall || ' pts already redeemed; recorded as debt' end),
    auth.uid())
  returning id into tx;
  update public.loyalty_memberships set
    points_balance = points_balance - take,
    points_debt = points_debt + shortfall,
    lifetime_redeemed = lifetime_redeemed + case when p_kind = 'redeem' then p_points else 0 end,
    lifetime_expired = lifetime_expired + case when p_kind = 'expire' then p_points else 0 end,
    lifetime_reversed = lifetime_reversed + case when p_kind = 'earn_reversal' then p_points else 0 end,
    updated_at = now()
  where id = m.id;
  perform public._loyalty_flag_wallet(m.id);
  return tx;
end $$;

-- ---------------------------------------------------------------- eligibility & tiers
-- Eligible spend for an invoice, ex-VAT, after configured exclusions and discount treatment.
create or replace function public.loyalty_invoice_eligible_net(p_invoice uuid)
returns numeric language plpgsql stable security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  inv public.invoices;
  items_all numeric;
  items_ok numeric;
  disc numeric;
begin
  select * into r from public.loyalty_rules where id = 1;
  select * into inv from public.invoices where id = p_invoice;
  if inv.id is null then return 0; end if;
  select coalesce(sum(line_total), 0),
         coalesce(sum(line_total) filter (where not (kind = any (r.excluded_item_kinds))), 0)
    into items_all, items_ok
    from public.invoice_items where invoice_id = p_invoice;
  disc := case when r.discount_treatment = 'reduce_eligible' and items_all > 0
               then coalesce(inv.discount, 0) * items_ok / items_all else 0 end;
  return greatest(0, round(items_ok - disc, 2));
end $$;

create or replace function public._loyalty_multiplier(p_tier text)
returns integer language sql stable security definer set search_path to '' as $$
  select case p_tier when 'vip' then vip_multiplier_bp when 'silver' then silver_multiplier_bp
              else member_multiplier_bp end
  from public.loyalty_rules where id = 1
$$;

create or replace function public.loyalty_recalculate_tier(p_membership uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  spend numeric;
  new_tier text;
begin
  select * into r from public.loyalty_rules where id = 1;
  select coalesce(sum(eligible_aed), 0) into spend
    from public.loyalty_transactions
    where membership_id = p_membership and kind in ('earn', 'earn_reversal')
      and created_at >= now() - interval '12 months';
  spend := greatest(spend, 0);
  new_tier := case when spend >= r.vip_threshold_aed then 'vip'
                   when spend >= r.silver_threshold_aed then 'silver' else 'member' end;
  update public.loyalty_memberships
     set rolling_spend_aed = spend,
         tier_updated_at = case when tier <> new_tier then now() else tier_updated_at end,
         tier = new_tier, updated_at = now()
   where id = p_membership;
  perform public._loyalty_flag_wallet(p_membership);
  return new_tier;
end $$;

create or replace function public._loyalty_membership_for_invoice(p_invoice uuid)
returns public.loyalty_memberships language sql stable security definer set search_path to '' as $$
  select m.* from public.invoices i
    join public.jobs j on j.id = i.job_id
    join public.loyalty_memberships m on m.customer_id = j.customer_id
   where i.id = p_invoice
$$;

create or replace function public._loyalty_customer_excluded(p_membership public.loyalty_memberships)
returns boolean language sql stable security definer set search_path to '' as $$
  select case p_membership.earning_override
           when 'include' then false
           when 'exclude' then true
           else coalesce((select c.customer_type = any (r.excluded_customer_types)
                            from public.customers c, public.loyalty_rules r
                           where c.id = p_membership.customer_id and r.id = 1), false)
         end
$$;

-- ---------------------------------------------------------------- earning
-- Idempotent: the earn row for a payment is keyed 'earn:pay:<payment_id>'.
create or replace function public.loyalty_process_payment(p_payment uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  pay public.payments;
  inv public.invoices;
  m public.loyalty_memberships;
  eligible numeric;
  paid_before numeric;
  elig_before numeric;
  elig_after numeric;
  base integer;
  mult integer;
  pts integer;
  k text := 'earn:pay:' || p_payment;
begin
  select * into r from public.loyalty_rules where id = 1;
  if not r.program_enabled then return 0; end if;
  if exists (select 1 from public.loyalty_transactions where idempotency_key = k) then return 0; end if;
  select * into pay from public.payments where id = p_payment;
  if pay.id is null or pay.direction <> 'in' or pay.invoice_id is null or pay.amount <= 0
     or coalesce(pay.method, '') = any (r.excluded_payment_methods) then return 0; end if;
  select * into inv from public.invoices where id = pay.invoice_id;
  if inv.status in ('cancelled', 'draft') or coalesce(inv.total, 0) <= 0 then return 0; end if;
  m := public._loyalty_membership_for_invoice(inv.id);
  if m.id is null or m.status <> 'active' then return 0; end if;
  if public._loyalty_customer_excluded(m) then return 0; end if;
  if coalesce(pay.created_at, now()) < m.enrolled_at - make_interval(days => r.retro_award_days) then return 0; end if;

  perform 1 from public.loyalty_memberships where id = m.id for update;
  if exists (select 1 from public.loyalty_transactions where idempotency_key = k) then return 0; end if;
  if exists (select 1 from public.loyalty_transactions
              where idempotency_key = 'cancel:inv:' || inv.id) then return 0; end if;

  eligible := public.loyalty_invoice_eligible_net(inv.id);
  select coalesce(sum(payment_amount), 0), coalesce(sum(eligible_aed), 0)
    into paid_before, elig_before
    from public.loyalty_transactions
   where invoice_id = inv.id and kind in ('earn', 'earn_reversal');
  elig_after := round(eligible * least(1, (paid_before + pay.amount) / inv.total), 2);
  if elig_after <= elig_before then
    elig_after := elig_before;
  end if;
  base := floor(elig_after * r.earn_points_per_aed)::int - floor(elig_before * r.earn_points_per_aed)::int;
  mult := public._loyalty_multiplier(m.tier);
  pts := floor(base * mult / 100.0)::int;

  perform public._loyalty_credit(
    m.id, 'earn', pts, k, now() + make_interval(months => r.expiry_months),
    p_invoice => inv.id, p_payment => pay.id, p_payment_amount => pay.amount,
    p_eligible => elig_after - elig_before, p_multiplier => mult);
  perform public.loyalty_recalculate_tier(m.id);
  return pts;
end $$;

-- Award eligible payments made shortly before enrollment (within retro_award_days).
create or replace function public._loyalty_award_retro(p_membership uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  total integer := 0;
  p record;
begin
  for p in
    select pay.id from public.payments pay
      join public.invoices i on i.id = pay.invoice_id
      join public.jobs j on j.id = i.job_id
      join public.loyalty_memberships m on m.customer_id = j.customer_id
     where m.id = p_membership and pay.direction = 'in'
     order by pay.created_at, pay.id
  loop
    total := total + public.loyalty_process_payment(p.id);
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------- reversals
create or replace function public.loyalty_reverse_payment(p_payment uuid, p_reason text default 'payment removed')
returns integer language plpgsql security definer set search_path to '' as $$
declare
  e public.loyalty_transactions;
  k text := 'rev:pay:' || p_payment;
begin
  select * into e from public.loyalty_transactions where idempotency_key = 'earn:pay:' || p_payment;
  if e.id is null or exists (select 1 from public.loyalty_transactions where idempotency_key = k) then
    return 0;
  end if;
  if e.points > 0 then
    perform public._loyalty_debit(e.membership_id, 'earn_reversal', e.points, k, true,
      p_invoice => e.invoice_id, p_payment => p_payment, p_payment_amount => -e.payment_amount,
      p_eligible => -e.eligible_aed, p_reason => p_reason);
  else
    insert into public.loyalty_transactions (membership_id, kind, points, balance_after, debt_after,
      invoice_id, payment_id, payment_amount, eligible_aed, idempotency_key, reason, created_by)
    select m.id, 'earn', 0, m.points_balance, m.points_debt, e.invoice_id, p_payment,
           -e.payment_amount, -e.eligible_aed, k, p_reason, auth.uid()
      from public.loyalty_memberships m where m.id = e.membership_id;
  end if;
  perform public.loyalty_recalculate_tier(e.membership_id);
  return e.points;
end $$;

-- Full reversal of an invoice (cancellation): earned points back out, applied redemptions restored.
create or replace function public.loyalty_reverse_invoice(p_invoice uuid, p_reason text default 'invoice cancelled')
returns integer language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  net_points integer;
  net_paid numeric;
  net_elig numeric;
  red public.loyalty_redemptions;
  r public.loyalty_rules;
  k text := 'cancel:inv:' || p_invoice;
begin
  select * into r from public.loyalty_rules where id = 1;
  select mm.* into m from public.loyalty_memberships mm
   where mm.id = (select membership_id from public.loyalty_transactions where invoice_id = p_invoice limit 1)
      or mm.id = (select membership_id from public.loyalty_redemptions where invoice_id = p_invoice limit 1)
   limit 1;
  if m.id is null then return 0; end if;
  perform 1 from public.loyalty_memberships where id = m.id for update;
  if exists (select 1 from public.loyalty_transactions where idempotency_key = k) then return 0; end if;

  select coalesce(sum(points), 0), coalesce(sum(payment_amount), 0), coalesce(sum(eligible_aed), 0)
    into net_points, net_paid, net_elig
    from public.loyalty_transactions where invoice_id = p_invoice and kind in ('earn', 'earn_reversal');
  if net_points > 0 then
    perform public._loyalty_debit(m.id, 'earn_reversal', net_points, k, true, p_invoice => p_invoice,
      p_payment_amount => -net_paid, p_eligible => -net_elig, p_reason => p_reason);
  else
    insert into public.loyalty_transactions (membership_id, kind, points, balance_after, debt_after,
      invoice_id, payment_amount, eligible_aed, idempotency_key, reason, created_by)
    values (m.id, 'earn', 0, m.points_balance, m.points_debt, p_invoice, -net_paid, -net_elig, k, p_reason, auth.uid());
  end if;

  for red in select * from public.loyalty_redemptions where invoice_id = p_invoice
               and status in ('requested', 'applied') for update loop
    if red.status = 'applied' then
      perform public._loyalty_credit(m.id, 'redeem_reversal', red.points, 'rev:red:' || red.id,
        now() + make_interval(months => r.expiry_months), p_invoice => p_invoice, p_redemption => red.id,
        p_reason => p_reason);
      update public.loyalty_redemptions set status = 'reversed', decision_note = p_reason where id = red.id;
    else
      update public.loyalty_redemptions set status = 'cancelled', decision_note = p_reason where id = red.id;
    end if;
  end loop;
  perform public.loyalty_recalculate_tier(m.id);
  return net_points;
end $$;

-- Partial refund (amount incl. VAT). Reverses the proportional share of points earned on the invoice.
create or replace function public.loyalty_refund_invoice(p_invoice uuid, p_refund_amount numeric, p_reference text)
returns integer language plpgsql security definer set search_path to '' as $$
declare
  inv public.invoices;
  m public.loyalty_memberships;
  net_points integer;
  net_paid numeric;
  net_elig numeric;
  share numeric;
  pts integer;
  elig numeric;
  k text;
begin
  if not public.has_perm('loyalty.finance') then raise exception 'Not authorised'; end if;
  if p_refund_amount is null or p_refund_amount <= 0 then raise exception 'Refund amount must be positive'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Refund reference is required'; end if;
  k := 'refund:inv:' || p_invoice || ':' || trim(p_reference);
  if exists (select 1 from public.loyalty_transactions where idempotency_key = k) then return 0; end if;
  select * into inv from public.invoices where id = p_invoice;
  m := public._loyalty_membership_for_invoice(p_invoice);
  if inv.id is null or m.id is null then return 0; end if;
  perform 1 from public.loyalty_memberships where id = m.id for update;
  select coalesce(sum(points), 0), coalesce(sum(payment_amount), 0), coalesce(sum(eligible_aed), 0)
    into net_points, net_paid, net_elig
    from public.loyalty_transactions where invoice_id = p_invoice and kind in ('earn', 'earn_reversal');
  if net_points <= 0 or net_paid <= 0 then return 0; end if;
  share := least(1, p_refund_amount / net_paid);
  pts := ceil(net_points * share)::int;
  elig := round(net_elig * share, 2);
  perform public._loyalty_debit(m.id, 'earn_reversal', pts, k, true, p_invoice => p_invoice,
    p_payment_amount => -least(p_refund_amount, net_paid), p_eligible => -elig,
    p_reason => 'refund ' || trim(p_reference));
  perform public.loyalty_recalculate_tier(m.id);
  return pts;
end $$;

-- ---------------------------------------------------------------- expiry
create or replace function public.loyalty_expire_due()
returns integer language plpgsql security definer set search_path to '' as $$
declare
  lot record;
  n integer := 0;
begin
  for lot in
    select id, membership_id, remaining_points from public.loyalty_transactions
     where remaining_points > 0 and expires_at <= now()
     order by expires_at limit 5000
  loop
    perform 1 from public.loyalty_memberships where id = lot.membership_id for update;
    select remaining_points into lot.remaining_points from public.loyalty_transactions where id = lot.id;
    continue when lot.remaining_points <= 0
      or exists (select 1 from public.loyalty_transactions where idempotency_key = 'expire:' || lot.id);
    perform public._loyalty_debit(lot.membership_id, 'expire', lot.remaining_points, 'expire:' || lot.id,
      false, p_lot => lot.id, p_reason => 'points expired');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- redemption
create or replace function public.loyalty_redemption_limit(p_invoice uuid)
returns table (max_points integer, max_value_aed numeric, min_points integer, available_points integer)
language plpgsql stable security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  m public.loyalty_memberships;
  cap numeric;
begin
  select * into r from public.loyalty_rules where id = 1;
  m := public._loyalty_membership_for_invoice(p_invoice);
  cap := floor(public.loyalty_invoice_eligible_net(p_invoice) * r.max_redeem_pct) / 100;
  max_points := least(coalesce(m.points_balance, 0), floor(cap * r.points_per_aed_redeemed)::int);
  max_value_aed := floor(max_points * 100.0 / r.points_per_aed_redeemed) / 100;
  min_points := r.min_redeem_points;
  available_points := coalesce(m.points_balance, 0);
  return next;
end $$;

create or replace function public.loyalty_request_redemption(p_invoice uuid, p_points integer, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  inv public.invoices;
  m public.loyalty_memberships;
  lim record;
  existing uuid;
  new_id uuid;
begin
  if not public.has_perm('loyalty.redeem_request') then raise exception 'Not authorised'; end if;
  select id into existing from public.loyalty_redemptions where idempotency_key = p_idempotency_key;
  if existing is not null then return existing; end if;
  select * into r from public.loyalty_rules where id = 1;
  if not r.program_enabled then raise exception 'Loyalty program is not enabled'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null or inv.status not in ('draft', 'unpaid', 'partial') then
    raise exception 'Invoice is not open for redemption';
  end if;
  m := public._loyalty_membership_for_invoice(p_invoice);
  if m.id is null or m.status <> 'active' then raise exception 'Customer is not an active member'; end if;
  perform 1 from public.loyalty_memberships where id = m.id for update;
  select * into lim from public.loyalty_redemption_limit(p_invoice);
  if p_points < r.min_redeem_points then
    raise exception 'Minimum redemption is % points', r.min_redeem_points;
  end if;
  if p_points > lim.max_points then
    raise exception 'Maximum redeemable on this invoice is % points', lim.max_points;
  end if;
  insert into public.loyalty_redemptions (membership_id, invoice_id, points, value_aed, requested_by, idempotency_key)
  values (m.id, p_invoice, p_points, floor(p_points * 100.0 / r.points_per_aed_redeemed) / 100, auth.uid(), p_idempotency_key)
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'This invoice already has an open redemption';
end $$;

create or replace function public.loyalty_decide_redemption(p_redemption uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare
  r public.loyalty_rules;
  red public.loyalty_redemptions;
  inv public.invoices;
  lim record;
  pay_id uuid;
  new_paid numeric;
begin
  if not public.has_perm('loyalty.approve') then raise exception 'Not authorised'; end if;
  select * into red from public.loyalty_redemptions where id = p_redemption for update;
  if red.id is null then raise exception 'Redemption not found'; end if;
  if red.status <> 'requested' then return red.status; end if;
  if not p_approve then
    update public.loyalty_redemptions set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_note = p_note where id = red.id;
    return 'rejected';
  end if;
  select * into r from public.loyalty_rules where id = 1;
  if r.redemption_accounting = 'pending_review' then
    raise exception 'Redemption accounting treatment has not been approved yet (Owner must set it in loyalty rules)';
  end if;
  select * into inv from public.invoices where id = red.invoice_id for update;
  if inv.status not in ('draft', 'unpaid', 'partial') then raise exception 'Invoice is no longer open'; end if;
  perform 1 from public.loyalty_memberships where id = red.membership_id for update;
  select * into lim from public.loyalty_redemption_limit(red.invoice_id);
  if red.points > lim.max_points then raise exception 'Redemption now exceeds the allowed limit (% points)', lim.max_points; end if;
  if red.value_aed > coalesce(inv.total, 0) - coalesce(inv.amount_paid, 0) then
    raise exception 'Redemption value exceeds the invoice balance due';
  end if;

  perform public._loyalty_debit(red.membership_id, 'redeem', red.points, 'redeem:' || red.id, false,
    p_invoice => red.invoice_id, p_redemption => red.id, p_reason => 'redeemed on invoice ' || inv.invoice_number);

  -- 'tender': rewards settle part of the balance like a payment; invoice VAT and totals are unchanged.
  insert into public.payments (direction, invoice_id, amount, method, reference, paid_at, note, created_by)
  values ('in', inv.id, red.value_aed, 'loyalty_points', 'LOYALTY-' || red.id, current_date,
          red.points || ' loyalty points redeemed', auth.uid())
  returning id into pay_id;
  new_paid := coalesce(inv.amount_paid, 0) + red.value_aed;
  update public.invoices set amount_paid = new_paid,
    status = case when new_paid >= inv.total - 0.005 then 'paid' else 'partial' end,
    updated_at = now()
  where id = inv.id;
  update public.loyalty_redemptions set status = 'applied', payment_id = pay_id, decided_by = auth.uid(),
    decided_at = now(), decision_note = p_note where id = red.id;
  return 'applied';
end $$;

-- ---------------------------------------------------------------- manual adjustments (maker-checker)
create or replace function public.loyalty_request_adjustment(p_membership uuid, p_points integer, p_reason text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  new_id uuid;
begin
  if not public.has_perm('loyalty.adjust_request') then raise exception 'Not authorised'; end if;
  select id into new_id from public.loyalty_adjustments where idempotency_key = p_idempotency_key;
  if new_id is not null then return new_id; end if;
  insert into public.loyalty_adjustments (membership_id, points, reason, requested_by, idempotency_key)
  values (p_membership, p_points, trim(p_reason), auth.uid(), p_idempotency_key) returning id into new_id;
  return new_id;
end $$;

create or replace function public.loyalty_decide_adjustment(p_adjustment uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare
  a public.loyalty_adjustments;
  r public.loyalty_rules;
begin
  if not public.has_perm('loyalty.approve') then raise exception 'Not authorised'; end if;
  select * into a from public.loyalty_adjustments where id = p_adjustment for update;
  if a.id is null then raise exception 'Adjustment not found'; end if;
  if a.status <> 'requested' then return a.status; end if;
  if a.requested_by = auth.uid() then raise exception 'A different authorised user must approve this adjustment'; end if;
  if p_approve then
    select * into r from public.loyalty_rules where id = 1;
    if a.points > 0 then
      perform public._loyalty_credit(a.membership_id, 'adjust', a.points, 'adjust:' || a.id,
        now() + make_interval(months => r.expiry_months), p_adjustment => a.id, p_reason => a.reason);
    else
      perform public._loyalty_debit(a.membership_id, 'adjust', -a.points, 'adjust:' || a.id, false,
        p_adjustment => a.id, p_reason => a.reason);
    end if;
  end if;
  update public.loyalty_adjustments set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note where id = a.id;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

create or replace function public.loyalty_set_earning_override(p_membership uuid, p_override text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if public.auth_role() is distinct from 'owner' then raise exception 'Only the Owner can change earning eligibility'; end if;
  if p_override is not null and p_override not in ('include', 'exclude') then raise exception 'Invalid override'; end if;
  update public.loyalty_memberships set earning_override = p_override, updated_at = now() where id = p_membership;
end $$;

-- ---------------------------------------------------------------- enrollment
-- Staff: returns (creating if needed) the opaque enrollment token printed in QR codes.
create or replace function public.loyalty_invite(p_customer uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare
  t text;
begin
  if not (public.has_perm('invoices.view') or public.has_perm('jobs.view_all') or public.has_perm('customers.view')) then
    raise exception 'Not authorised';
  end if;
  if p_customer is null or not exists (select 1 from public.customers where id = p_customer) then return null; end if;
  insert into public.loyalty_memberships (customer_id, invited_by) values (p_customer, auth.uid())
    on conflict (customer_id) do nothing;
  select enroll_token into t from public.loyalty_memberships where customer_id = p_customer;
  return t;
end $$;

-- Public: minimal, non-identifying info for the join page.
create or replace function public.loyalty_enroll_lookup(p_token text)
returns table (first_name text, status text, membership_number text, locked boolean)
language sql stable security definer set search_path to '' as $$
  select split_part(c.full_name, ' ', 1),
         m.status,
         case when m.status = 'active' then m.membership_number end,
         m.enroll_failed_attempts >= 5
    from public.loyalty_memberships m join public.customers c on c.id = m.customer_id
   where length(p_token) = 64 and m.enroll_token = p_token
$$;

-- Public: customer confirms with the last 4 digits of their registered mobile and records consent.
create or replace function public.loyalty_enroll(p_token text, p_mobile_last4 text, p_whatsapp_opt_in boolean)
returns text language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  c public.customers;
  digits text;
  ok boolean;
begin
  if p_token is null or length(p_token) <> 64 then return 'invalid'; end if;
  select * into m from public.loyalty_memberships where enroll_token = p_token for update;
  if m.id is null then return 'invalid'; end if;
  if m.status = 'active' then return 'already_active'; end if;
  if m.status <> 'invited' then return 'unavailable'; end if;
  if m.enroll_failed_attempts >= 5 then return 'locked'; end if;
  select * into c from public.customers where id = m.customer_id;
  digits := regexp_replace(coalesce(p_mobile_last4, ''), '\D', '', 'g');
  ok := length(digits) = 4 and (
        right(regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g'), 4) = digits
     or right(regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g'), 4) = digits
     or right(regexp_replace(coalesce(c.alt_mobile, ''), '\D', '', 'g'), 4) = digits);
  if not ok then
    update public.loyalty_memberships set enroll_failed_attempts = enroll_failed_attempts + 1 where id = m.id;
    return 'mismatch';
  end if;
  update public.loyalty_memberships set status = 'active', enrolled_at = now(), enrolled_via = 'qr',
    enroll_failed_attempts = 0, updated_at = now() where id = m.id;
  insert into public.customer_notification_preferences
    (customer_id, whatsapp_service_reminders, whatsapp_loyalty_updates, consent_source, consent_at)
  values (m.customer_id, coalesce(p_whatsapp_opt_in, false), coalesce(p_whatsapp_opt_in, false), 'loyalty_qr', now())
  on conflict (customer_id) do update set
    whatsapp_service_reminders = excluded.whatsapp_service_reminders,
    whatsapp_loyalty_updates = excluded.whatsapp_loyalty_updates,
    consent_source = excluded.consent_source, consent_at = excluded.consent_at,
    opted_out_at = case when excluded.whatsapp_service_reminders then null else now() end,
    updated_at = now();
  perform public._loyalty_award_retro(m.id);
  return 'enrolled';
end $$;

-- ---------------------------------------------------------------- read model for documents
create or replace function public.loyalty_invoice_summary(p_invoice uuid)
returns table (
  program_enabled boolean, membership_status text, membership_number text, tier text,
  points_earned integer, points_available integer, redeemed_points integer, redeemed_value_aed numeric,
  enroll_token text)
language plpgsql security definer set search_path to '' as $$
declare
  m public.loyalty_memberships;
  cust uuid;
begin
  if not (public.has_perm('invoices.view') or public.has_perm('loyalty.view')) then raise exception 'Not authorised'; end if;
  select j.customer_id into cust from public.invoices i join public.jobs j on j.id = i.job_id where i.id = p_invoice;
  if cust is not null then
    perform public.loyalty_invite(cust);
  end if;
  m := public._loyalty_membership_for_invoice(p_invoice);
  select r.program_enabled into program_enabled from public.loyalty_rules r where r.id = 1;
  membership_status := m.status;
  membership_number := case when m.status = 'active' then m.membership_number end;
  tier := m.tier;
  points_available := m.points_balance;
  enroll_token := m.enroll_token;
  select coalesce(sum(points), 0) into points_earned
    from public.loyalty_transactions where invoice_id = p_invoice and kind in ('earn', 'earn_reversal');
  select coalesce(sum(points), 0), coalesce(sum(value_aed), 0) into redeemed_points, redeemed_value_aed
    from public.loyalty_redemptions where invoice_id = p_invoice and status = 'applied';
  return next;
end $$;

create or replace function public.loyalty_customer_token(p_job uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare
  cust uuid;
begin
  select customer_id into cust from public.jobs where id = p_job;
  return public.loyalty_invite(cust);
end $$;

-- ---------------------------------------------------------------- fail-safe triggers
-- Loyalty must never block recording a payment or cancelling an invoice: errors are logged instead.
create or replace function public.loyalty_payments_trigger()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.loyalty_process_payment(new.id);
    elsif tg_op = 'DELETE' then
      perform public.loyalty_reverse_payment(old.id, 'payment deleted');
    end if;
  exception when others then
    perform public._loyalty_log_error('payments_' || lower(tg_op), coalesce(new.id, old.id), sqlerrm);
  end;
  return null;
end $$;
drop trigger if exists loyalty_payments_trigger on public.payments;
create trigger loyalty_payments_trigger after insert or delete on public.payments
  for each row execute function public.loyalty_payments_trigger();

create or replace function public.loyalty_invoices_trigger()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  begin
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      perform public.loyalty_reverse_invoice(new.id, 'invoice cancelled');
    end if;
  exception when others then
    perform public._loyalty_log_error('invoice_cancel', new.id, sqlerrm);
  end;
  return null;
end $$;
drop trigger if exists loyalty_invoices_trigger on public.invoices;
create trigger loyalty_invoices_trigger after update of status on public.invoices
  for each row execute function public.loyalty_invoices_trigger();

-- ---------------------------------------------------------------- RLS & grants
alter table public.loyalty_rules enable row level security;
alter table public.loyalty_rule_changes enable row level security;
alter table public.loyalty_memberships enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_adjustments enable row level security;
alter table public.loyalty_processing_errors enable row level security;
alter table public.wallet_passes enable row level security;
alter table public.customer_notification_preferences enable row level security;
alter table public.vehicle_service_schedules enable row level security;
alter table public.reminder_events enable row level security;
alter table public.reminder_delivery_logs enable row level security;

revoke all on public.loyalty_rules, public.loyalty_rule_changes, public.loyalty_memberships,
  public.loyalty_transactions, public.loyalty_redemptions, public.loyalty_adjustments,
  public.loyalty_processing_errors, public.wallet_passes, public.customer_notification_preferences,
  public.vehicle_service_schedules, public.reminder_events, public.reminder_delivery_logs
  from anon, authenticated;

grant select on public.loyalty_rules, public.loyalty_memberships, public.loyalty_transactions,
  public.loyalty_redemptions, public.loyalty_adjustments, public.loyalty_rule_changes,
  public.loyalty_processing_errors, public.wallet_passes, public.customer_notification_preferences,
  public.vehicle_service_schedules, public.reminder_events, public.reminder_delivery_logs
  to authenticated;
grant update on public.loyalty_rules to authenticated;
grant insert, update on public.customer_notification_preferences to authenticated;

drop policy if exists loyalty_rules_select on public.loyalty_rules;
create policy loyalty_rules_select on public.loyalty_rules for select to authenticated using (public.has_perm('loyalty.view'));
drop policy if exists loyalty_rules_update on public.loyalty_rules;
create policy loyalty_rules_update on public.loyalty_rules for update to authenticated
  using (public.auth_role() = 'owner') with check (public.auth_role() = 'owner');
drop policy if exists loyalty_rule_changes_select on public.loyalty_rule_changes;
create policy loyalty_rule_changes_select on public.loyalty_rule_changes for select to authenticated using (public.has_perm('loyalty.finance'));
drop policy if exists loyalty_memberships_select on public.loyalty_memberships;
create policy loyalty_memberships_select on public.loyalty_memberships for select to authenticated using (public.has_perm('loyalty.view'));
drop policy if exists loyalty_transactions_select on public.loyalty_transactions;
create policy loyalty_transactions_select on public.loyalty_transactions for select to authenticated using (public.has_perm('loyalty.view'));
drop policy if exists loyalty_redemptions_select on public.loyalty_redemptions;
create policy loyalty_redemptions_select on public.loyalty_redemptions for select to authenticated using (public.has_perm('loyalty.view'));
drop policy if exists loyalty_adjustments_select on public.loyalty_adjustments;
create policy loyalty_adjustments_select on public.loyalty_adjustments for select to authenticated
  using (public.has_perm('loyalty.approve') or public.has_perm('loyalty.adjust_request'));
drop policy if exists loyalty_errors_select on public.loyalty_processing_errors;
create policy loyalty_errors_select on public.loyalty_processing_errors for select to authenticated using (public.has_perm('loyalty.finance'));
drop policy if exists wallet_passes_select on public.wallet_passes;
create policy wallet_passes_select on public.wallet_passes for select to authenticated using (public.has_perm('loyalty.view'));
drop policy if exists notif_prefs_select on public.customer_notification_preferences;
create policy notif_prefs_select on public.customer_notification_preferences for select to authenticated using (public.has_perm('customers.view'));
drop policy if exists notif_prefs_insert on public.customer_notification_preferences;
create policy notif_prefs_insert on public.customer_notification_preferences for insert to authenticated with check (public.has_perm('customers.edit'));
drop policy if exists notif_prefs_update on public.customer_notification_preferences;
create policy notif_prefs_update on public.customer_notification_preferences for update to authenticated
  using (public.has_perm('customers.edit')) with check (public.has_perm('customers.edit'));
drop policy if exists service_schedules_select on public.vehicle_service_schedules;
create policy service_schedules_select on public.vehicle_service_schedules for select to authenticated using (public.has_perm('vehicles.view'));
drop policy if exists reminder_events_select on public.reminder_events;
create policy reminder_events_select on public.reminder_events for select to authenticated using (public.has_perm('vehicles.view'));
drop policy if exists reminder_logs_select on public.reminder_delivery_logs;
create policy reminder_logs_select on public.reminder_delivery_logs for select to authenticated using (public.has_perm('vehicles.view'));

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'loyalty%' or p.proname like '\_loyalty%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function
  public.loyalty_invoice_eligible_net(uuid), public.loyalty_redemption_limit(uuid),
  public.loyalty_request_redemption(uuid, integer, text), public.loyalty_decide_redemption(uuid, boolean, text),
  public.loyalty_request_adjustment(uuid, integer, text, text), public.loyalty_decide_adjustment(uuid, boolean, text),
  public.loyalty_set_earning_override(uuid, text), public.loyalty_refund_invoice(uuid, numeric, text),
  public.loyalty_invite(uuid), public.loyalty_invoice_summary(uuid), public.loyalty_customer_token(uuid)
  to authenticated;
grant execute on function public.loyalty_enroll_lookup(text), public.loyalty_enroll(text, text, boolean) to anon, authenticated;
-- loyalty_process_payment, loyalty_reverse_*, loyalty_expire_due, loyalty_recalculate_tier: service role / triggers only.

commit;
