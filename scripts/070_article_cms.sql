-- 070: bilingual Article CMS on top of blog_posts. Additive only: legacy
-- scalar rows (content = '{}') stay readable as English via lib/article-model.ts.
begin;

alter table public.blog_posts add column if not exists article_key text;
alter table public.blog_posts add column if not exists content jsonb not null default '{}'::jsonb;
alter table public.blog_posts add column if not exists workflow text not null default 'draft';
alter table public.blog_posts add column if not exists brand_slug text;
alter table public.blog_posts add column if not exists service_slugs text[] not null default '{}';
alter table public.blog_posts add column if not exists related_keys text[] not null default '{}';
alter table public.blog_posts add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.blog_posts add column if not exists brief jsonb;
alter table public.blog_posts add column if not exists cover_illustrative boolean not null default false;
alter table public.blog_posts add column if not exists reviewed_by text;
alter table public.blog_posts add column if not exists reviewed_at timestamptz;
alter table public.blog_posts add column if not exists revision integer not null default 1;

do $$ begin
  alter table public.blog_posts add constraint blog_posts_workflow_check
    check (workflow in ('brief', 'draft', 'in_review', 'approved'));
exception when duplicate_object then null; end $$;

create unique index if not exists blog_posts_article_key_key on public.blog_posts (article_key) where article_key is not null;
create unique index if not exists blog_posts_slug_key_070 on public.blog_posts (slug);
create index if not exists blog_posts_brand_slug_idx on public.blog_posts (brand_slug);
create index if not exists blog_posts_status_published_idx on public.blog_posts (status, published_at desc);

commit;
