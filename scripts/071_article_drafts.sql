-- 071: private article draft store + immutable history + transactional publish.
--
-- Publication isolation: `article_drafts` holds every editable article (brief,
-- draft, in review, approved). `blog_posts` holds ONLY published snapshots and
-- is written exclusively by article_publish()/article_unpublish(). Saving a
-- draft never touches blog_posts, so a live article keeps its last published
-- snapshot until someone explicitly publishes again.
--
-- Additive: no existing table or column is altered or dropped.

create table if not exists public.article_drafts (
  id uuid primary key default gen_random_uuid(),
  article_key text not null unique,
  slug text not null unique,
  brand_slug text,
  workflow text not null default 'draft' check (workflow in ('brief', 'draft', 'in_review', 'approved')),
  doc jsonb not null,
  revision integer not null default 1,
  published_revision integer,
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists article_drafts_brand_idx on public.article_drafts (brand_slug);

create table if not exists public.article_versions (
  id bigint generated always as identity primary key,
  draft_id uuid references public.article_drafts (id) on delete set null,
  article_key text not null,
  revision integer not null,
  action text not null check (action in ('import', 'create', 'save', 'approve', 'publish', 'unpublish')),
  doc jsonb not null,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists article_versions_key_idx on public.article_versions (article_key, created_at desc);

-- Private: RLS on with no policies, and no table privileges for API roles.
-- Only the service role (server actions behind website.manage) can read them.
alter table public.article_drafts enable row level security;
alter table public.article_versions enable row level security;
revoke all on public.article_drafts from anon, authenticated;
revoke all on public.article_versions from anon, authenticated;

-- Compare-and-swap save. Raises 40001 when the caller's revision is stale.
create or replace function public.article_save(
  p_id uuid, p_expected_revision integer, p_key text, p_slug text, p_brand text,
  p_workflow text, p_doc jsonb, p_action text, p_actor text
) returns public.article_drafts
language plpgsql security definer set search_path = public as $$
declare d public.article_drafts;
begin
  if p_id is null then
    insert into article_drafts (article_key, slug, brand_slug, workflow, doc, updated_by)
    values (p_key, p_slug, p_brand, p_workflow, p_doc, p_actor)
    returning * into d;
  else
    update article_drafts
       set slug = p_slug, brand_slug = p_brand, workflow = p_workflow, doc = p_doc,
           revision = revision + 1, updated_at = now(), updated_by = p_actor
     where id = p_id and revision = p_expected_revision
    returning * into d;
    if not found then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
  end if;
  insert into article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, p_action, p_doc, p_actor);
  return d;
end $$;

-- Writes the public snapshot in the same transaction as the revision check.
create or replace function public.article_publish(
  p_id uuid, p_expected_revision integer, p_post jsonb, p_actor text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d public.article_drafts;
  r public.blog_posts;
  v_post uuid;
begin
  select * into d from article_drafts where id = p_id for update;
  if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if d.revision <> p_expected_revision then raise exception 'revision_conflict' using errcode = '40001'; end if;

  r := jsonb_populate_record(null::public.blog_posts, p_post);
  update blog_posts set
    slug = r.slug, title = r.title, excerpt = r.excerpt, body = r.body, content = r.content,
    status = 'published', workflow = r.workflow, brand_slug = r.brand_slug,
    service_slugs = r.service_slugs, related_keys = r.related_keys, sources = r.sources,
    brief = null, cover_url = r.cover_url, cover_illustrative = r.cover_illustrative,
    reviewed_by = r.reviewed_by, reviewed_at = r.reviewed_at, author = r.author,
    published_at = coalesce(d.first_published_at, now()), updated_at = now(), revision = d.revision
  where article_key = d.article_key
  returning id into v_post;

  if v_post is null then
    insert into blog_posts (article_key, slug, title, excerpt, body, content, status, workflow, brand_slug,
      service_slugs, related_keys, sources, brief, cover_url, cover_illustrative, reviewed_by, reviewed_at,
      author, published_at, updated_at, revision)
    values (d.article_key, r.slug, r.title, r.excerpt, r.body, r.content, 'published', r.workflow, r.brand_slug,
      r.service_slugs, r.related_keys, r.sources, null, r.cover_url, r.cover_illustrative, r.reviewed_by,
      r.reviewed_at, r.author, coalesce(d.first_published_at, now()), now(), d.revision)
    returning id into v_post;
  end if;

  update article_drafts
     set published_revision = d.revision, first_published_at = coalesce(first_published_at, now())
   where id = d.id;
  insert into article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, 'publish', p_post, p_actor);
  return v_post;
end $$;

-- Removes the public snapshot; the draft and every version stay.
create or replace function public.article_unpublish(
  p_id uuid, p_expected_revision integer, p_actor text
) returns void
language plpgsql security definer set search_path = public as $$
declare d public.article_drafts;
begin
  select * into d from article_drafts where id = p_id for update;
  if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if d.revision <> p_expected_revision then raise exception 'revision_conflict' using errcode = '40001'; end if;
  delete from blog_posts where article_key = d.article_key;
  update article_drafts set published_revision = null where id = d.id;
  insert into article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, 'unpublish', d.doc, p_actor);
end $$;

revoke all on function public.article_save(uuid, integer, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.article_publish(uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.article_unpublish(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.article_save(uuid, integer, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.article_publish(uuid, integer, jsonb, text) to service_role;
grant execute on function public.article_unpublish(uuid, integer, text) to service_role;
