-- Rollback for 070. Only valid BEFORE any article content exists.
--
-- Dropping these columns would destroy imported/published article copy, so
-- this script refuses to run once any row uses them or once the 071 draft
-- store exists. After imports, use 071_article_drafts_recovery.sql instead —
-- it takes articles offline without deleting any content.

do $$
begin
  if to_regclass('public.article_drafts') is not null then
    raise exception '070 rollback refused: 071 draft store exists. Use 071_article_drafts_recovery.sql (non-destructive).';
  end if;
  if exists (select 1 from public.blog_posts where article_key is not null or content <> '{}'::jsonb) then
    raise exception '070 rollback refused: article content exists. Use 071_article_drafts_recovery.sql (non-destructive).';
  end if;
end $$;

drop index if exists public.blog_posts_status_published_idx;
drop index if exists public.blog_posts_brand_slug_idx;
drop index if exists public.blog_posts_slug_key_070;
drop index if exists public.blog_posts_article_key_key;
alter table public.blog_posts drop constraint if exists blog_posts_workflow_check;
alter table public.blog_posts
  drop column if exists revision,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists cover_illustrative,
  drop column if exists brief,
  drop column if exists sources,
  drop column if exists related_keys,
  drop column if exists service_slugs,
  drop column if exists brand_slug,
  drop column if exists workflow,
  drop column if exists content,
  drop column if exists article_key;
