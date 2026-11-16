-- Default monthly targets per service advisor, category enable/disable, and closed reporting periods.
-- Additive only: no existing row, column or workflow is changed.

alter table public.settings
  add column if not exists advisor_default_targets jsonb not null default
    '{"labour":50000,"used_parts":20000,"new_parts":30000,"addon":10000,"reviews":20}'::jsonb,
  add column if not exists performance_closed_through date;

alter table public.advisor_targets
  add column if not exists enabled boolean not null default true,
  add column if not exists adjustment_reason text;
