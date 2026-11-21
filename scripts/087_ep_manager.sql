-- Electrical & Programming Manager: leads the electrical/programming section,
-- assigns electricians, and earns a commission on programming work.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.staff_targets'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.staff_targets drop constraint %I', c);
  end loop;
end $$;

alter table public.staff_targets
  add constraint staff_targets_kind_check check (kind in ('purchase', 'sales', 'technician', 'addon', 'department'));

-- Technician rights plus leading job cards, splitting tasks, technical QC and seeing all workshop jobs.
insert into public.role_permissions (role, permission, allowed)
select 'ep_manager', permission, allowed from public.role_permissions where role = 'technician'
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission, allowed)
select 'ep_manager', p.permission, true
from (values ('tasks.assign'), ('jobs.assign_master'), ('jobs.qc_approve'), ('jobs.view_all'), ('jobs.view_assigned'), ('jobs.update_status')) as p(permission)
on conflict (role, permission) do update set allowed = true;

-- Omar Khaled moves from Service Advisor to the new section manager role with 35% on programming.
update public.profiles
set role = 'ep_manager', job_title = 'Electrical & Programming Manager', department = 'Electrical & Programming'
where id = 'f7a18592-09dd-495c-8aa7-d73249214298';

insert into public.staff_targets (user_id, kind, monthly_target, commission_percent, updated_at)
values ('f7a18592-09dd-495c-8aa7-d73249214298', 'department', 0, 35, now())
on conflict (user_id, kind) do update set commission_percent = excluded.commission_percent, updated_at = now();
