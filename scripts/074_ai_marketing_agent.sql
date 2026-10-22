-- AI Marketing Manager — Phase 2 (integrations, AI agent, gated execution).
-- Additive only: new tables + replacement of the Phase 1 execution guard.
-- Live execution stays OFF until the owner explicitly enables it per platform
-- AND the server env AI_MARKETING_LIVE_EXECUTION=true is set.

-- Latest results of real API checks (Meta, Google Ads, AI generation, CRM attribution).
create table if not exists public.ai_marketing_integration_checks (
  id uuid primary key default gen_random_uuid(),
  check_type text not null check (check_type in ('meta', 'google', 'ai', 'attribution')),
  ok boolean not null,
  status text not null check (status in ('connected', 'limited', 'not_configured', 'error')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  checked_by uuid references auth.users(id) on delete set null,
  checked_by_name text,
  checked_at timestamptz not null default now()
);
create index if not exists ai_mkt_checks_type_idx on public.ai_marketing_integration_checks (check_type, checked_at desc);

-- Every attempted ad-platform action: who, which account, before/after and the raw API result.
create table if not exists public.ai_marketing_action_log (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references public.ai_marketing_recommendations(id) on delete set null,
  platform text not null check (platform in ('meta', 'google')),
  account_id text,
  action_type text not null,
  idempotency_key text not null unique,
  previous_values jsonb,
  new_values jsonb,
  api_result jsonb,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'blocked')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_mkt_action_rec_idx on public.ai_marketing_action_log (recommendation_id, created_at desc);

-- Per-platform publishing switch. Off by default; only the owner can turn it on.
create table if not exists public.ai_marketing_execution_settings (
  platform text primary key check (platform in ('meta', 'google')),
  publishing_enabled boolean not null default false,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
insert into public.ai_marketing_execution_settings (platform) values ('meta'), ('google')
  on conflict (platform) do nothing;

-- Replace the Phase 1 kill switch with a per-platform check. 'general' can never execute.
create or replace function public.ai_marketing_execution_enabled(p_platform text)
returns boolean language sql stable set search_path to '' as $$
  select coalesce(
    (select publishing_enabled from public.ai_marketing_execution_settings where platform = p_platform),
    false
  )
$$;

create or replace function public.ai_marketing_guard_status()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'New recommendations must start as pending';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('executed', 'failed') and not public.ai_marketing_execution_enabled(new.platform) then
      raise exception 'Execution is disabled for this platform';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('approved', 'rejected')) or
      (old.status = 'approved' and new.status in ('rejected', 'executed', 'failed'))
    ) then
      raise exception 'Invalid status change % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;

alter table public.ai_marketing_integration_checks enable row level security;
alter table public.ai_marketing_action_log enable row level security;
alter table public.ai_marketing_execution_settings enable row level security;

drop policy if exists ai_mkt_checks_select on public.ai_marketing_integration_checks;
create policy ai_mkt_checks_select on public.ai_marketing_integration_checks
  for select using (public.auth_role() = 'owner');
drop policy if exists ai_mkt_checks_insert on public.ai_marketing_integration_checks;
create policy ai_mkt_checks_insert on public.ai_marketing_integration_checks
  for insert with check (public.auth_role() = 'owner');

drop policy if exists ai_mkt_action_select on public.ai_marketing_action_log;
create policy ai_mkt_action_select on public.ai_marketing_action_log
  for select using (public.auth_role() = 'owner');
drop policy if exists ai_mkt_action_insert on public.ai_marketing_action_log;
create policy ai_mkt_action_insert on public.ai_marketing_action_log
  for insert with check (public.auth_role() = 'owner');
drop policy if exists ai_mkt_action_update on public.ai_marketing_action_log;
create policy ai_mkt_action_update on public.ai_marketing_action_log
  for update using (public.auth_role() = 'owner') with check (public.auth_role() = 'owner');

drop policy if exists ai_mkt_exec_select on public.ai_marketing_execution_settings;
create policy ai_mkt_exec_select on public.ai_marketing_execution_settings
  for select using (public.auth_role() = 'owner');
drop policy if exists ai_mkt_exec_update on public.ai_marketing_execution_settings;
create policy ai_mkt_exec_update on public.ai_marketing_execution_settings
  for update using (public.auth_role() = 'owner') with check (public.auth_role() = 'owner');
-- No delete policies anywhere: all records are kept for audit.
