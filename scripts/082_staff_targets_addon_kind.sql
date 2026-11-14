alter table public.staff_targets drop constraint if exists staff_targets_kind_check;
alter table public.staff_targets
  add constraint staff_targets_kind_check check (kind = any (array['purchase', 'sales', 'technician', 'addon']));
