-- 076: Subscription, Renewal & Business Continuity Management.
-- Reads are protected by RLS; all writes go through permission-checked server
-- actions using the service role. Payments and reminder deliveries are
-- permanent audit records.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  service_name text not null check (length(trim(service_name)) > 0),
  category text not null default 'other' check (category in (
    'hosting', 'database', 'domain_dns', 'email_workspace', 'messaging', 'marketing', 'ai_api',
    'ssl', 'email_delivery', 'backup', 'software_license', 'diagnostic_tool', 'crm_integration', 'other'
  )),
  vendor text,
  account_reference text,
  service_url text check (service_url is null or service_url ~* '^https?://'),
  billing_portal_url text check (billing_portal_url is null or billing_portal_url ~* '^https://'),
  portal_verified_at timestamptz,
  portal_verified_by uuid references auth.users(id) on delete set null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'quarterly', 'yearly', 'custom')),
  custom_cycle_days integer check (custom_cycle_days is null or custom_cycle_days between 1 and 3660),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_aed numeric(14, 6) not null default 1 check (fx_rate_to_aed > 0),
  vat_rate numeric(5, 2) not null default 0 check (vat_rate between 0 and 100),
  amount_includes_vat boolean not null default false,
  next_due_date date not null,
  renewal_type text not null default 'manual' check (renewal_type in ('auto', 'manual')),
  auto_renew boolean not null default false,
  payment_method_label text check (payment_method_label is null or payment_method_label !~ '[0-9][0-9 -]{11,}'),
  owner_id uuid references public.profiles(id) on delete set null,
  viewer_ids uuid[] not null default '{}',
  department text,
  criticality text not null default 'medium' check (criticality in ('critical', 'high', 'medium', 'low')),
  notes text,
  status text not null default 'active' check (status in ('active', 'pending_verification', 'paused', 'cancelled')),
  verification_source text,
  resolved_due_date date,
  resolved_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint subscriptions_custom_cycle check (billing_cycle <> 'custom' or custom_cycle_days is not null)
);

create index if not exists subscriptions_due_idx on public.subscriptions (next_due_date) where status in ('active', 'pending_verification');
create index if not exists subscriptions_owner_idx on public.subscriptions (owner_id);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_aed numeric(14, 6) not null default 1 check (fx_rate_to_aed > 0),
  paid_on date not null,
  method text not null check (method in ('provider_portal', 'bank_transfer', 'hosted_checkout', 'cash', 'other')),
  transaction_ref text,
  receipt_path text,
  invoice_path text,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'rejected')),
  confirmation_source text check (confirmation_source in ('manual', 'provider_webhook', 'provider_api')),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_name text,
  recorded_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);

create index if not exists subscription_payments_sub_idx on public.subscription_payments (subscription_id, paid_on desc);

create or replace function public.subscription_payment_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Subscription payments are permanent audit records and cannot be deleted';
  end if;
  if new.subscription_id is distinct from old.subscription_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.paid_on is distinct from old.paid_on
     or new.due_date is distinct from old.due_date
     or new.transaction_ref is distinct from old.transaction_ref
     or new.recorded_by is distinct from old.recorded_by
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'Recorded payments cannot be edited; reject it and record a new one';
  end if;
  if old.status <> 'pending_confirmation' then
    raise exception 'This payment has already been decided';
  end if;
  if new.status = 'pending_confirmation' or new.decided_by is null or new.decided_at is null then
    raise exception 'A payment decision must record who decided and when';
  end if;
  if new.status = 'confirmed' and new.confirmation_source is null then
    raise exception 'A confirmed payment must record its confirmation source';
  end if;
  return new;
end $$;

drop trigger if exists subscription_payment_guard on public.subscription_payments;
create trigger subscription_payment_guard before update or delete on public.subscription_payments
  for each row execute function public.subscription_payment_guard();

create table if not exists public.subscription_attachments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  payment_id uuid references public.subscription_payments(id) on delete set null,
  kind text not null default 'invoice' check (kind in ('invoice', 'receipt', 'contract', 'other')),
  path text not null,
  file_name text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists subscription_attachments_sub_idx on public.subscription_attachments (subscription_id, created_at desc);

-- One row per (subscription, due date, stage, channel, recipient): the unique
-- key is the duplicate-prevention guarantee for the reminder engine.
create table if not exists public.subscription_reminders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  due_date date not null,
  stage text not null,
  escalated boolean not null default false,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp')),
  recipient_id uuid references auth.users(id) on delete set null,
  recipient_key text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, due_date, stage, channel, recipient_key)
);

create index if not exists subscription_reminders_sub_idx on public.subscription_reminders (subscription_id, created_at desc);
create index if not exists subscription_reminders_retry_idx on public.subscription_reminders (status, attempts) where status = 'failed';

create table if not exists public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  detail jsonb
);

create index if not exists scheduled_job_runs_job_idx on public.scheduled_job_runs (job, started_at desc);

create table if not exists public.service_monitors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('http', 'database', 'auth', 'backup', 'scheduled_job')),
  target_url text check (target_url is null or target_url ~* '^https?://'),
  job_name text,
  freshness_hours integer check (freshness_hours is null or freshness_hours > 0),
  criticality text not null default 'high' check (criticality in ('critical', 'high', 'medium', 'low')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  escalation_contacts text,
  recovery_instructions text,
  enabled boolean not null default true,
  last_status text not null default 'unknown' check (last_status in ('up', 'down', 'degraded', 'unknown')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  constraint service_monitors_http_target check (kind <> 'http' or target_url is not null),
  constraint service_monitors_fresh check (kind not in ('backup', 'scheduled_job') or (job_name is not null and freshness_hours is not null))
);

create table if not exists public.service_checks (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.service_monitors(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('up', 'down', 'degraded')),
  latency_ms integer,
  http_status integer,
  error text
);

create index if not exists service_checks_monitor_idx on public.service_checks (monitor_id, checked_at desc);

create table if not exists public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.service_monitors(id) on delete cascade,
  cause text not null default 'outage' check (cause in ('outage', 'suspected_unpaid', 'stale')),
  summary text not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz
);

create index if not exists service_incidents_open_idx on public.service_incidents (monitor_id) where resolved_at is null;

alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_attachments enable row level security;
alter table public.subscription_reminders enable row level security;
alter table public.scheduled_job_runs enable row level security;
alter table public.service_monitors enable row level security;
alter table public.service_checks enable row level security;
alter table public.service_incidents enable row level security;

create or replace function public.can_view_subscription(sub_owner uuid, sub_viewers uuid[])
returns boolean language sql stable set search_path to '' as $$
  select public.auth_role() = 'owner'
    or public.has_perm('subscriptions.manage')
    or (public.has_perm('subscriptions.view_assigned') and (sub_owner = auth.uid() or auth.uid() = any(sub_viewers)))
$$;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (public.can_view_subscription(owner_id, viewer_ids));

drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments
  for select using (exists (
    select 1 from public.subscriptions s
    where s.id = subscription_id and public.can_view_subscription(s.owner_id, s.viewer_ids)
  ));

drop policy if exists subscription_attachments_select on public.subscription_attachments;
create policy subscription_attachments_select on public.subscription_attachments
  for select using (exists (
    select 1 from public.subscriptions s
    where s.id = subscription_id and public.can_view_subscription(s.owner_id, s.viewer_ids)
  ));

drop policy if exists subscription_reminders_select on public.subscription_reminders;
create policy subscription_reminders_select on public.subscription_reminders
  for select using (public.auth_role() = 'owner' or public.has_perm('subscriptions.manage'));

drop policy if exists scheduled_job_runs_select on public.scheduled_job_runs;
create policy scheduled_job_runs_select on public.scheduled_job_runs
  for select using (public.auth_role() = 'owner' or public.has_perm('continuity.view'));

drop policy if exists service_monitors_select on public.service_monitors;
create policy service_monitors_select on public.service_monitors
  for select using (public.auth_role() = 'owner' or public.has_perm('continuity.view'));

drop policy if exists service_checks_select on public.service_checks;
create policy service_checks_select on public.service_checks
  for select using (public.auth_role() = 'owner' or public.has_perm('continuity.view'));

drop policy if exists service_incidents_select on public.service_incidents;
create policy service_incidents_select on public.service_incidents
  for select using (public.auth_role() = 'owner' or public.has_perm('continuity.view'));

-- Default grants: Finance manages records and prepares payments; the Workshop
-- Manager sees only subscriptions assigned to them. Payment approval stays
-- with the Owner unless granted explicitly in the permission matrix.
insert into public.role_permissions (role, permission, allowed)
select v.role, v.permission, true
from (values
  ('owner', 'subscriptions.manage'),
  ('owner', 'subscriptions.approve'),
  ('owner', 'continuity.view'),
  ('finance', 'subscriptions.manage'),
  ('finance', 'continuity.view'),
  ('workshop_manager', 'subscriptions.view_assigned')
) as v(role, permission)
where not exists (
  select 1 from public.role_permissions rp where rp.role = v.role and rp.permission = v.permission
);

-- Built-in continuity monitors. These describe SWURX's own systems, not
-- provider subscriptions; no subscription is assumed to exist.
insert into public.service_monitors (name, kind, target_url, job_name, freshness_hours, criticality, recovery_instructions)
select * from (values
  ('CRM availability', 'http', 'https://swurxauto.com/api/health', null::text, null::integer, 'critical',
    'Check the Vercel deployment status and the latest deployment logs. If the project is paused, check Vercel billing.'),
  ('Public website', 'http', 'https://swurxauto.com/', null, null, 'critical',
    'Open the site in a private window. Check Vercel deployments, domain and DNS records.'),
  ('Database connection', 'database', null, null, null, 'critical',
    'Check the Supabase project status page and the project billing. A paused project must be restored from the Supabase dashboard.'),
  ('Authentication', 'auth', null, null, null, 'critical',
    'Check Supabase Auth health and Auth logs. Staff can still be notified by email while Auth is down.'),
  ('Renewal reminder job', 'scheduled_job', null, 'subscription-reminders', 26, 'high',
    'Check Vercel Cron Jobs for /api/cron/subscriptions and confirm CRON_SECRET is set.'),
  ('Database backup freshness', 'backup', null, 'backup', 192, 'high',
    'Run scripts/backup-database.mjs and confirm it reports a heartbeat to /api/cron/heartbeat.')
) as m(name, kind, target_url, job_name, freshness_hours, criticality, recovery_instructions)
where not exists (select 1 from public.service_monitors);
