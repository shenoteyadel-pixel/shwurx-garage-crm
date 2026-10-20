-- AI Marketing Manager — Phase 1 (UI + safe storage only).
-- New tables only; no existing table is changed. Owner-only via RLS.
-- Nothing in this phase executes ad actions: the 'executed' / 'failed'
-- statuses exist for the future execution phase and are blocked by trigger
-- until public.ai_marketing_execution_enabled() is deliberately changed.

create table if not exists public.ai_marketing_recommendations (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'general' check (platform in ('meta', 'google', 'general')),
  title text not null check (char_length(title) between 3 and 200),
  summary text check (char_length(summary) <= 4000),
  proposed_action jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 2000),
  executed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_mkt_rec_status_idx on public.ai_marketing_recommendations (status, created_at desc);

create table if not exists public.ai_marketing_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.ai_marketing_recommendations(id) on delete cascade,
  event text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ai_mkt_evt_rec_idx on public.ai_marketing_recommendation_events (recommendation_id, created_at);

-- Execution kill switch. Returns false in Phase 1; only a reviewed future
-- migration may change this.
create or replace function public.ai_marketing_execution_enabled()
returns boolean language sql immutable set search_path to '' as $$ select false $$;

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
    if new.status in ('executed', 'failed') and not public.ai_marketing_execution_enabled() then
      raise exception 'Execution is disabled in this phase';
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

create or replace function public.ai_marketing_log_event()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ai_marketing_recommendation_events (recommendation_id, event, to_status, actor_id, actor_name)
    values (new.id, 'created', new.status, new.created_by, new.created_by_name);
  elsif new.status is distinct from old.status then
    insert into public.ai_marketing_recommendation_events
      (recommendation_id, event, from_status, to_status, actor_id, actor_name, note)
    values (new.id, 'status_changed', old.status, new.status, new.decided_by, new.decided_by_name, new.decision_note);
  end if;
  return null;
end $$;

drop trigger if exists ai_mkt_rec_guard on public.ai_marketing_recommendations;
create trigger ai_mkt_rec_guard before insert or update on public.ai_marketing_recommendations
  for each row execute function public.ai_marketing_guard_status();

drop trigger if exists ai_mkt_rec_log on public.ai_marketing_recommendations;
create trigger ai_mkt_rec_log after insert or update on public.ai_marketing_recommendations
  for each row execute function public.ai_marketing_log_event();

alter table public.ai_marketing_recommendations enable row level security;
alter table public.ai_marketing_recommendation_events enable row level security;

drop policy if exists ai_mkt_rec_select on public.ai_marketing_recommendations;
create policy ai_mkt_rec_select on public.ai_marketing_recommendations
  for select using (public.auth_role() = 'owner');
drop policy if exists ai_mkt_rec_insert on public.ai_marketing_recommendations;
create policy ai_mkt_rec_insert on public.ai_marketing_recommendations
  for insert with check (public.auth_role() = 'owner');
drop policy if exists ai_mkt_rec_update on public.ai_marketing_recommendations;
create policy ai_mkt_rec_update on public.ai_marketing_recommendations
  for update using (public.auth_role() = 'owner') with check (public.auth_role() = 'owner');
-- No delete policy: records are kept for audit.

drop policy if exists ai_mkt_evt_select on public.ai_marketing_recommendation_events;
create policy ai_mkt_evt_select on public.ai_marketing_recommendation_events
  for select using (public.auth_role() = 'owner');
-- Events are written only by the security-definer trigger; no insert/update/delete policies.
