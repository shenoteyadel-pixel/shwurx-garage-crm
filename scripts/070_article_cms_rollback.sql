-- Reverts 070. Bilingual copy in `content` is lost; scalar English columns remain.
begin;
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
commit;
