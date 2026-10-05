-- Rollback for 050_website_cms.sql. Export website_revisions first if you
-- want to keep published history (Website Center → Publish history → Export).
-- After rollback the public site falls back to shipped defaults + site_content.

begin;
drop function if exists public.website_publish(int, uuid, text, text);
drop function if exists public.website_save_draft(int, jsonb, uuid, text);
drop table if exists public.website_documents;
drop table if exists public.website_revisions;
drop index if exists public.leads_submission_id_uniq;
alter table public.blog_posts drop column if exists translation_group;
alter table public.blog_posts drop column if exists locale;
commit;
