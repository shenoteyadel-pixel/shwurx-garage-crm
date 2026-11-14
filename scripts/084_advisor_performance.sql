-- Service advisor performance: five independent categories with target history,
-- part-source classification, review-request tracking and commission approvals.
-- Additive only: no existing column, row or workflow is changed.

create table if not exists public.advisor_targets (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'individual' check (scope in ('individual', 'team')),
  user_id uuid references public.profiles(id) on delete cascade,
  category text not null check (category in ('labour', 'used_parts', 'new_parts', 'addon', 'reviews')),
  month date not null check (extract(day from month) = 1),
  target numeric not null default 0 check (target >= 0),
  commission_percent numeric not null default 0 check (commission_percent between 0 and 100),
  bonus_amount numeric not null default 0 check (bonus_amount >= 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by uuid references public.profiles(id) on delete set null,
  constraint advisor_targets_scope_user check (
    (scope = 'team' and user_id is null) or (scope = 'individual' and user_id is not null)
  )
);
create unique index if not exists advisor_targets_active_uidx
  on public.advisor_targets (scope, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), category, month)
  where superseded_at is null;
create index if not exists advisor_targets_month_idx on public.advisor_targets (month);
alter table public.advisor_targets enable row level security;

create table if not exists public.advisor_commission_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category text not null check (category in ('labour', 'used_parts', 'new_parts', 'reviews')),
  qualified_amount numeric not null default 0,
  amount numeric not null default 0 check (amount >= 0),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  note text,
  unique (user_id, month, category)
);
alter table public.advisor_commission_approvals enable row level security;

alter table public.invoice_items
  add column if not exists part_source text
  check (part_source in ('genuine', 'oem', 'aftermarket', 'refurbished', 'used'));
alter table public.inventory_items
  add column if not exists part_source text
  check (part_source in ('genuine', 'oem', 'aftermarket', 'refurbished', 'used'));

alter table public.settings
  add column if not exists google_review_url text,
  add column if not exists part_source_buckets jsonb not null default
    '{"genuine":"new","oem":"new","aftermarket":"new","refurbished":"new","used":"used","unclassified":"new"}'::jsonb;

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  advisor_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  customer_mobile text,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms', 'email', 'other')),
  status text not null default 'sent' check (status in ('sent', 'delivered', 'failed')),
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verification_evidence text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists review_requests_job_uidx on public.review_requests (job_id) where job_id is not null;
create index if not exists review_requests_advisor_idx on public.review_requests (advisor_id, sent_at);
alter table public.review_requests enable row level security;
