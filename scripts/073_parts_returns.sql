-- Parts returns: record when a part on a job card is sent back to the
-- supplier or returned to garage stock. Additive only; existing rows untouched.
alter table public.parts_requests
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references auth.users(id) on delete set null,
  add column if not exists return_to text,
  add column if not exists return_reason text,
  add column if not exists return_quantity numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'parts_requests_return_to_check'
  ) then
    alter table public.parts_requests
      add constraint parts_requests_return_to_check
      check (return_to is null or return_to in ('supplier', 'stock'));
  end if;
end $$;

create index if not exists parts_requests_returned_idx
  on public.parts_requests (job_id) where returned_at is not null;
