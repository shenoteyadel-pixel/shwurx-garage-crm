-- Non-destructive rollback / write freeze for 050_website_cms.sql.
-- Retains CMS drafts, all revision/history rows and the published pointer,
-- lead dedupe protection, and ALL blog columns/data (including preexisting ones).
-- Public service-role reads continue to serve the current published snapshot.
-- Roll back application code separately; this does NOT force seed fallback.
-- Reapply the reviewed forward migration to re-enable CMS writes.
-- No DROP/TRUNCATE/DELETE, no lead/RPC grants or unrelated CRM changes.

begin;

-- Guard absent objects, so this retention rollback is safe to repeat or run
-- after a forward migration failed before creating CMS objects.
do $$
declare t text; c record; f regprocedure;
begin
  foreach t in array array['website_documents', 'website_revisions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
      for c in select column_name from information_schema.columns
        where table_schema = 'public' and table_name = t
      loop
        execute format('revoke all (%I) on public.%I from public, anon, authenticated, service_role', c.column_name, t);
      end loop;
      execute format('grant select on public.%I to service_role', t);
    end if;
  end loop;
  if to_regclass('public.website_revisions_id_seq') is not null then
    revoke all on sequence public.website_revisions_id_seq from public, anon, authenticated, service_role;
  end if;
  foreach f in array array[
    to_regprocedure('public.website_save_draft(integer,jsonb,uuid,text)'),
    to_regprocedure('public.website_publish(integer,uuid,text,text)')
  ] loop
    if f is not null then
      execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    end if;
  end loop;
end; $$;

commit;
