-- 060: one appointment per website submission id (mirrors leads_submission_id_uniq in 050).
-- Reviewed migration — NOT applied by v0. Rollback: 060_appointment_submission_unique_rollback.sql
--
-- Depends only on public.appointments.metadata (jsonb), which submit_appointment
-- already writes. submit_appointment has no exception handler, so a duplicate
-- surfaces to the API route as SQLSTATE 23505, which the route resolves to the
-- existing row (lib/website/submit-once.ts).
--
-- Pre-check: aborts (nothing changed) if duplicate submission ids already exist.
-- Inspect them first with:
--   select metadata->>'submission_id' as sid, array_agg(id order by created_at)
--   from public.appointments
--   where metadata ? 'submission_id' and metadata->>'submission_id' is not null
--   group by 1 having count(*) > 1;
-- Explicit JSON null submission ids map to SQL NULL, which the unique index
-- accepts any number of times, so the pre-check ignores them too.

begin;

do $$
declare v_dupes int;
begin
  select count(*) into v_dupes from (
    select 1 from public.appointments
    where metadata ? 'submission_id' and metadata->>'submission_id' is not null
    group by metadata->>'submission_id'
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'appointments has % duplicated submission_id group(s); resolve them before applying 060', v_dupes;
  end if;
end $$;

create unique index if not exists appointments_submission_id_uniq
  on public.appointments ((metadata->>'submission_id'))
  where metadata ? 'submission_id';

commit;
