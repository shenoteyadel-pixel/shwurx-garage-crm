-- Reverses 060. Data is untouched; the route falls back to best-effort pre-select dedupe.
begin;
drop index if exists public.appointments_submission_id_uniq;
commit;
