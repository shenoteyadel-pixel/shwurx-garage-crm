-- Permanent parts price catalog + mandatory approval controls.
-- Additive only: no existing table, row, quotation or approval is modified.
--
-- * parts_price_catalog       one row per exact part/consumable specification
-- * parts_price_revisions     append-only selling-price history; the current
--                             price is the latest APPROVED revision in effect
-- * parts_price_current       view resolving that current price
-- * quotation_items           records which catalog revision priced a line
-- * approval_requests         separate final confirmation of the total
-- * work_authorization_overrides  recorded emergency exceptions
--
-- Supplier purchase costs stay on inventory/purchasing tables and are never
-- stored here, so cost and approved selling price remain separate.

create table if not exists public.parts_price_catalog (
  id uuid primary key default gen_random_uuid(),
  item_type text not null default 'part' check (item_type in ('part', 'consumable', 'oil')),
  name text not null check (length(trim(name)) > 0),
  brand text,
  manufacturer text,
  part_number text,
  quality text not null check (quality in ('genuine', 'oem_oes', 'aftermarket', 'used', 'refurbished')),
  condition text,
  specification text,
  product_line text,
  viscosity text,
  approvals text,
  package_size text,
  unit text not null default 'each',
  used_item_ref text,
  warranty_months integer check (warranty_months is null or warranty_months >= 0),
  identity_key text generated always as (
    lower(
      item_type || '|' || coalesce(trim(brand), '') || '|' || coalesce(trim(manufacturer), '') || '|' ||
      coalesce(regexp_replace(part_number, '[\s\-\.]', '', 'g'), '') || '|' || quality || '|' ||
      coalesce(trim(condition), '') || '|' || coalesce(trim(specification), '') || '|' ||
      coalesce(trim(product_line), '') || '|' || coalesce(regexp_replace(viscosity, '\s', '', 'g'), '') || '|' ||
      coalesce(trim(approvals), '') || '|' || coalesce(regexp_replace(package_size, '\s', '', 'g'), '') || '|' ||
      trim(unit) || '|' || coalesce(trim(used_item_ref), '') || '|' || coalesce(warranty_months::text, '')
    )
  ) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete set null,
  -- Engine oil is never interchangeable: the full specification is mandatory.
  constraint parts_price_catalog_oil_spec check (
    item_type <> 'oil' or (
      manufacturer is not null and product_line is not null and viscosity is not null
      and package_size is not null
    )
  ),
  -- Used / refurbished parts must state condition and warranty.
  constraint parts_price_catalog_used_spec check (
    quality not in ('used', 'refurbished') or (condition is not null and warranty_months is not null)
  )
);

create unique index if not exists parts_price_catalog_identity_uidx
  on public.parts_price_catalog (identity_key);
create index if not exists parts_price_catalog_part_number_idx
  on public.parts_price_catalog (lower(part_number)) where retired_at is null;

create table if not exists public.parts_price_revisions (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.parts_price_catalog(id) on delete restrict,
  selling_price numeric(12, 2) not null check (selling_price > 0),
  effective_from timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text not null check (length(trim(reason)) >= 3),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);

create index if not exists parts_price_revisions_catalog_idx
  on public.parts_price_revisions (catalog_id, status, effective_from desc);

-- Revisions are append-only: price, item and effective date never change, and
-- a revision can only move once from pending to approved/rejected.
create or replace function public.parts_price_revision_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Price revisions are permanent audit records and cannot be deleted';
  end if;
  if new.catalog_id is distinct from old.catalog_id
     or new.selling_price is distinct from old.selling_price
     or new.effective_from is distinct from old.effective_from
     or new.reason is distinct from old.reason
     or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at then
    raise exception 'Price revisions cannot be edited; create a new revision instead';
  end if;
  if old.status <> 'pending' then
    raise exception 'This price revision has already been decided';
  end if;
  if new.status = 'pending' or new.decided_by is null or new.decided_at is null then
    raise exception 'A decision must record who decided and when';
  end if;
  return new;
end $$;

drop trigger if exists parts_price_revision_guard on public.parts_price_revisions;
create trigger parts_price_revision_guard before update or delete on public.parts_price_revisions
  for each row execute function public.parts_price_revision_guard();

create or replace view public.parts_price_current
with (security_invoker = true) as
select distinct on (r.catalog_id)
  r.catalog_id,
  r.id as revision_id,
  r.selling_price,
  r.effective_from,
  r.decided_at
from public.parts_price_revisions r
where r.status = 'approved' and r.effective_from <= now()
order by r.catalog_id, r.effective_from desc, r.decided_at desc;

alter table public.quotation_items
  add column if not exists catalog_id uuid references public.parts_price_catalog(id) on delete set null,
  add column if not exists catalog_revision_id uuid references public.parts_price_revisions(id) on delete set null;

alter table public.approval_requests
  add column if not exists total_confirmed_at timestamptz,
  add column if not exists total_confirmed_amount numeric(12, 2);

create table if not exists public.work_authorization_overrides (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  scope text not null check (scope in ('start_work', 'order_parts')),
  reason text not null check (length(trim(reason)) >= 10),
  customer_contact text,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create index if not exists work_authorization_overrides_job_idx
  on public.work_authorization_overrides (job_id, scope, expires_at desc);

-- Overrides are kept for audit: no deletes, and the only permitted change is a
-- one-time revocation.
create or replace function public.work_authorization_override_guard()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Emergency authorizations are audit records and cannot be deleted';
  end if;
  if old.revoked_at is not null then
    raise exception 'This emergency authorization is already revoked';
  end if;
  if new.job_id is distinct from old.job_id
     or new.scope is distinct from old.scope
     or new.reason is distinct from old.reason
     or new.customer_contact is distinct from old.customer_contact
     or new.authorized_by is distinct from old.authorized_by
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or new.revoked_at is null then
    raise exception 'Emergency authorizations can only be revoked';
  end if;
  return new;
end $$;

drop trigger if exists work_authorization_override_guard on public.work_authorization_overrides;
create trigger work_authorization_override_guard before update or delete on public.work_authorization_overrides
  for each row execute function public.work_authorization_override_guard();

-- Staff can read; all writes go through permission-checked server actions
-- using the service role, so there are no insert/update/delete policies.
alter table public.parts_price_catalog enable row level security;
alter table public.parts_price_revisions enable row level security;
alter table public.work_authorization_overrides enable row level security;

drop policy if exists parts_price_catalog_select on public.parts_price_catalog;
create policy parts_price_catalog_select on public.parts_price_catalog
  for select using (public.auth_role() is not null and public.auth_role() <> 'customer');

drop policy if exists parts_price_revisions_select on public.parts_price_revisions;
create policy parts_price_revisions_select on public.parts_price_revisions
  for select using (public.auth_role() is not null and public.auth_role() <> 'customer');

drop policy if exists work_authorization_overrides_select on public.work_authorization_overrides;
create policy work_authorization_overrides_select on public.work_authorization_overrides
  for select using (public.auth_role() is not null and public.auth_role() <> 'customer');
