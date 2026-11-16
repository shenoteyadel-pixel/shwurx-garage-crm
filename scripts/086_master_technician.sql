-- Two-level technician assignment: Master Technician per job card, tasks per technician.
-- Additive only: new nullable/defaulted columns, one history table, one role, two permissions.

alter table public.jobs add column if not exists master_technician_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists master_assigned_at timestamptz;
alter table public.jobs add column if not exists master_assigned_by uuid references public.profiles(id) on delete set null;
create index if not exists jobs_master_technician_idx on public.jobs(master_technician_id) where deleted_at is null;

alter table public.technician_tasks add column if not exists estimated_hours numeric(6,2) check (estimated_hours is null or (estimated_hours >= 0 and estimated_hours <= 500));
alter table public.technician_tasks add column if not exists chargeable boolean not null default true;
alter table public.technician_tasks add column if not exists delay_reason text;
alter table public.technician_tasks add column if not exists rework_count integer not null default 0 check (rework_count >= 0);
alter table public.technician_tasks add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.technician_tasks add column if not exists overdue_notified_at timestamptz;

create table if not exists public.job_master_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_technician_id uuid references public.profiles(id) on delete set null,
  to_technician_id uuid references public.profiles(id) on delete set null,
  reason text,
  is_override boolean not null default false,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists job_master_assignments_job_idx on public.job_master_assignments(job_id, created_at desc);
alter table public.job_master_assignments enable row level security;

-- Backfill: existing jobs keep their current technician as the Master Technician.
update public.jobs set master_technician_id = technician_id, master_assigned_at = coalesce(updated_at, created_at)
where master_technician_id is null and technician_id is not null and deleted_at is null and stage <> 'delivered';

-- Master Technician role: technician rights plus task assignment and technical QC.
insert into public.role_permissions (role, permission, allowed)
select 'master_technician', permission, allowed from public.role_permissions where role = 'technician'
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission, allowed)
select r.role, p.permission, true
from (values ('master_technician'), ('workshop_manager'), ('workshop_supervisor'), ('owner'), ('general_manager')) as r(role)
cross join (values ('tasks.assign'), ('jobs.qc_approve')) as p(permission)
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission, allowed)
select r.role, 'jobs.assign_master', true
from (values ('service_advisor'), ('workshop_manager'), ('workshop_supervisor'), ('owner'), ('general_manager')) as r(role)
on conflict (role, permission) do nothing;

insert into public.role_permissions (role, permission, allowed)
select r.role, 'jobs.override_master', true
from (values ('workshop_manager'), ('owner'), ('general_manager')) as r(role)
on conflict (role, permission) do nothing;
