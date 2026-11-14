-- Service Advisor add-on sales & profit commission.
-- Catalog (admin-priced), per-job sale lines with frozen price/cost/rate
-- snapshots, and one payout row per sale so commission can never be paid twice.

create table if not exists public.addon_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  category text not null default 'General',
  kind text not null default 'service' check (kind in ('product', 'service')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  purchase_cost numeric(12,2) not null default 0 check (purchase_cost >= 0),
  extra_cost numeric(12,2) not null default 0 check (extra_cost >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  commission_pct numeric(5,2) not null default 25 check (commission_pct between 0 and 100),
  commission_eligible boolean not null default true,
  compatible_makes text,
  interval_km integer check (interval_km is null or interval_km > 0),
  interval_months integer check (interval_months is null or interval_months > 0),
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists addon_catalog_code_uidx on public.addon_catalog (lower(code));

create table if not exists public.addon_sales (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  catalog_id uuid not null references public.addon_catalog(id) on delete restrict,
  advisor_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'approved', 'rejected', 'completed', 'cancelled')),
  -- Snapshots frozen when the line is created; never recomputed from the catalog.
  name text not null,
  category text not null,
  kind text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  unit_extra_cost numeric(12,2) not null,
  original_amount numeric(12,2) not null,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  net_amount numeric(12,2) not null,
  commission_pct numeric(5,2) not null,
  commission_eligible boolean not null,
  rate_override_reason text,
  recommendation text not null default 'recommended'
    check (recommendation in ('required', 'recommended', 'optional')),
  notes text,
  evidence_url text,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  item_key text,
  technician_task_id uuid references public.technician_tasks(id) on delete set null,
  parts_request_id uuid references public.parts_requests(id) on delete set null,
  approved_at timestamptz,
  decided_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  last_commission_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount <= original_amount)
);
-- One live line per catalog item per job: blocks duplicate recommendations.
create unique index if not exists addon_sales_job_item_uidx
  on public.addon_sales (job_id, catalog_id) where status not in ('rejected', 'cancelled');
create index if not exists addon_sales_advisor_idx on public.addon_sales (advisor_id, created_at desc);
create index if not exists addon_sales_job_idx on public.addon_sales (job_id);
create unique index if not exists addon_sales_item_key_uidx on public.addon_sales (item_key) where item_key is not null;

create table if not exists public.addon_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.addon_sales(id) on delete restrict,
  advisor_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text,
  reference text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reverse_reason text
);
-- At most one live payout per sale: prevents duplicate commission.
create unique index if not exists addon_payouts_sale_uidx
  on public.addon_commission_payouts (sale_id) where reversed_at is null;

alter table public.settings
  add column if not exists addon_partial_payment_policy text not null default 'proportional'
    check (addon_partial_payment_policy in ('proportional', 'full_only')),
  add column if not exists addon_discount_alert_pct numeric(5,2) not null default 20;

-- Reads are staff-only; every write goes through server actions using the service role.
alter table public.addon_catalog enable row level security;
alter table public.addon_sales enable row level security;
alter table public.addon_commission_payouts enable row level security;

drop policy if exists addon_catalog_select on public.addon_catalog;
create policy addon_catalog_select on public.addon_catalog for select
  using (has_perm('quotations.view') or has_perm('settings.manage'));

drop policy if exists addon_sales_select on public.addon_sales;
create policy addon_sales_select on public.addon_sales for select
  using (advisor_id = auth.uid() or has_perm('reports.financial') or has_perm('jobs.view_all'));

drop policy if exists addon_payouts_select on public.addon_commission_payouts;
create policy addon_payouts_select on public.addon_commission_payouts for select
  using (advisor_id = auth.uid() or has_perm('reports.financial') or has_perm('payroll.manage'));

insert into public.addon_catalog
  (code, name, category, kind, purchase_cost, extra_cost, selling_price, interval_km, interval_months, description)
values
  ('AO-OILFLUSH', 'Engine Oil Flush', 'Engine', 'service', 35, 15, 150, 20000, 12, 'Removes sludge and deposits before an oil change.'),
  ('AO-WIPERS', 'Wiper Blades (pair)', 'Visibility', 'product', 40, 0, 120, null, 12, 'Replacement front wiper blades.'),
  ('AO-WASHER', 'Washer Fluid Top-up', 'Visibility', 'product', 8, 2, 30, null, 6, 'Concentrated screen wash refill.'),
  ('AO-BRAKEFLUID', 'Brake Fluid Replacement', 'Brakes', 'service', 45, 40, 220, 40000, 24, 'Full brake fluid flush and bleed.'),
  ('AO-ACSANI', 'AC Sanitization', 'Air Conditioning', 'service', 30, 20, 180, null, 12, 'Evaporator and duct antibacterial treatment.'),
  ('AO-FUELCLEAN', 'Fuel System Cleaner', 'Engine', 'product', 25, 5, 95, 15000, 6, 'Injector and intake valve cleaner.'),
  ('AO-AIRFILTER', 'Engine Air Filter', 'Filters', 'product', 45, 10, 140, 20000, 12, 'Replacement engine air filter.'),
  ('AO-CABINFILTER', 'Cabin Filter', 'Filters', 'product', 35, 10, 120, 15000, 12, 'Pollen and dust cabin filter.'),
  ('AO-COOLANT', 'Coolant Replacement', 'Cooling', 'service', 60, 40, 260, 60000, 24, 'Drain, flush and refill engine coolant.'),
  ('AO-BATTERY', 'Battery Replacement', 'Electrical', 'product', 280, 30, 520, null, 36, 'New battery fitted and tested.')
on conflict do nothing;
