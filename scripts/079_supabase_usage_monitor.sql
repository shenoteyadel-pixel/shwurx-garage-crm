-- 079: Early warning before Supabase limits stop the CRM.
-- Adds a "capacity" monitor kind and incident cause, a server-only usage function,
-- and the "Supabase usage limits" monitor (checked every 15 minutes with the others).

begin;

alter table public.service_monitors drop constraint service_monitors_kind_check;
alter table public.service_monitors add constraint service_monitors_kind_check
  check (kind = any (array['http', 'database', 'auth', 'backup', 'scheduled_job', 'capacity']));

alter table public.service_incidents drop constraint service_incidents_cause_check;
alter table public.service_incidents add constraint service_incidents_cause_check
  check (cause = any (array['outage', 'suspected_unpaid', 'stale', 'capacity']));

create or replace function public.service_usage()
returns table (db_bytes bigint, storage_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database())::bigint,
    coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o), 0)::bigint
$$;

revoke all on function public.service_usage() from public, anon, authenticated;
grant execute on function public.service_usage() to service_role;

insert into public.service_monitors (name, kind, criticality, recovery_instructions)
select
  'Supabase usage limits',
  'capacity',
  'high',
  'Open the Supabase dashboard > Organization > Usage. Upgrade the plan or add disk / storage, or delete old files, before the limit is reached. Also confirm the billing card on Supabase is valid.'
where not exists (select 1 from public.service_monitors where kind = 'capacity');

commit;
