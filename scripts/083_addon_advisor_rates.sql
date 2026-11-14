-- Optional per-advisor upsell commission rate. When set it replaces the catalog
-- rate on new add-on lines; existing lines keep their frozen snapshot.
create table if not exists public.addon_advisor_rates (
  advisor_id uuid primary key references public.profiles(id) on delete cascade,
  commission_pct numeric(5,2) not null check (commission_pct between 0 and 100),
  reason text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.addon_advisor_rates enable row level security;

drop policy if exists addon_advisor_rates_select on public.addon_advisor_rates;
create policy addon_advisor_rates_select on public.addon_advisor_rates for select
  using (advisor_id = auth.uid() or has_perm('reports.financial') or has_perm('settings.manage'));
