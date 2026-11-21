-- Electrical & Programming Manager cleanup:
-- no parts / purchasing, only assigned job cards, Car Flow view, labour-hour advice,
-- freelance (attendance tracked only), Master Technician counts as assigned.

delete from public.role_permissions
where role = 'ep_manager'
  and (permission like 'parts.%' or permission like 'purchase_orders.%' or permission like 'purchases.%'
       or permission in ('jobs.view_all', 'jobs.assign_master', 'costs.view'));

insert into public.role_permissions (role, permission, allowed)
select 'ep_manager', p.permission, true
from (values ('flow.view'), ('labour.advise'), ('jobs.view_assigned'), ('tasks.assign')) as p(permission)
on conflict (role, permission) do update set allowed = true;

-- A job's Master Technician can open the job card they lead.
create or replace function public.is_job_tech(jid uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select exists (select 1 from public.job_technicians jt where jt.job_id = jid and jt.user_id = auth.uid())
      or exists (select 1 from public.technician_tasks tt where tt.job_id = jid and tt.technician_id = auth.uid())
      or exists (select 1 from public.jobs j where j.id = jid and j.master_technician_id = auth.uid())
$function$;

alter table public.profiles add column if not exists employment_type text not null default 'staff';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_employment_type_check') then
    alter table public.profiles
      add constraint profiles_employment_type_check check (employment_type in ('staff', 'freelance'));
  end if;
end $$;

update public.profiles set employment_type = 'freelance'
where id = 'f7a18592-09dd-495c-8aa7-d73249214298';

-- No target for now; the owner can set one any time on Staff Targets. 35% on programming stays.
update public.staff_targets set monthly_target = 0, commission_percent = 35, updated_at = now()
where user_id = 'f7a18592-09dd-495c-8aa7-d73249214298' and kind = 'department';
