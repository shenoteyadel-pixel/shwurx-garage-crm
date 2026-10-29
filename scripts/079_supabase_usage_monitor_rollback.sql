begin;

delete from public.service_incidents where cause = 'capacity';
delete from public.service_monitors where kind = 'capacity';
drop function if exists public.service_usage();

alter table public.service_incidents drop constraint service_incidents_cause_check;
alter table public.service_incidents add constraint service_incidents_cause_check
  check (cause = any (array['outage', 'suspected_unpaid', 'stale']));

alter table public.service_monitors drop constraint service_monitors_kind_check;
alter table public.service_monitors add constraint service_monitors_kind_check
  check (kind = any (array['http', 'database', 'auth', 'backup', 'scheduled_job']));

commit;
