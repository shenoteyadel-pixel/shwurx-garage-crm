-- 071 (rev 2): private article draft store + immutable history + transactional publish.
-- NOT APPLIED. Committed for native-harness review/replay before application.
--
-- Publication isolation: `article_drafts` holds every editable article (brief,
-- draft, in review, approved). `blog_posts` holds ONLY published snapshots and
-- is written exclusively by article_publish()/article_unpublish(). Saving a
-- draft never touches blog_posts.
--
-- Changes vs 4750e03:
--   * CAS is NULL-safe: a NULL expected revision is rejected (22004) instead of
--     slipping past `<>` comparisons; comparisons use IS DISTINCT FROM.
--   * publish/unpublish bump the draft revision, so two overlapping state
--     changes made against the same revision cannot both succeed.
--   * publish requires workflow = 'approved'.
--   * unpublish and recovery snapshot the removed blog_posts row into history,
--     including orphan rows (article_key set, no draft), before deleting.
--   * Explicit ACLs that do not depend on ambient Supabase defaults:
--     service_role gets SELECT only on both tables; INSERT/UPDATE/DELETE/
--     TRUNCATE/REFERENCES/TRIGGER are revoked; all writes go through the
--     SECURITY DEFINER RPCs below. History is additionally protected by
--     triggers that reject UPDATE, DELETE and TRUNCATE for every role.
--   * history FK is ON DELETE RESTRICT (SET NULL would rewrite history).
--
-- Authorization (website.manage) stays in the server actions; the RPCs are
-- executable by service_role only.
--
-- Additive: no existing table or column is altered or dropped.

begin;

create table if not exists public.article_drafts (
  id uuid primary key default gen_random_uuid(),
  article_key text not null unique,
  slug text not null unique,
  brand_slug text,
  workflow text not null default 'draft' check (workflow in ('brief', 'draft', 'in_review', 'approved')),
  doc jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  published_revision integer,
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists article_drafts_brand_idx on public.article_drafts (brand_slug);

create table if not exists public.article_versions (
  id bigint generated always as identity primary key,
  draft_id uuid references public.article_drafts (id) on delete restrict,
  article_key text not null,
  revision integer not null,
  action text not null check (action in ('import', 'create', 'save', 'approve', 'publish', 'unpublish', 'recovery')),
  doc jsonb not null,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists article_versions_key_idx on public.article_versions (article_key, created_at desc);
create index if not exists article_versions_draft_idx on public.article_versions (draft_id);

create or replace function public.article_versions_immutable()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'article_versions is append-only' using errcode = '42501';
end $$;

drop trigger if exists article_versions_no_update on public.article_versions;
create trigger article_versions_no_update before update or delete on public.article_versions
  for each row execute function public.article_versions_immutable();
drop trigger if exists article_versions_no_truncate on public.article_versions;
create trigger article_versions_no_truncate before truncate on public.article_versions
  for each statement execute function public.article_versions_immutable();

alter table public.article_drafts enable row level security;
alter table public.article_versions enable row level security;

revoke all on public.article_drafts from public, anon, authenticated, service_role;
revoke all on public.article_versions from public, anon, authenticated, service_role;
grant select on public.article_drafts to service_role;
grant select on public.article_versions to service_role;
-- Identity values are drawn by the SECURITY DEFINER owner; no client role may
-- call nextval/setval, even under permissive ambient default sequence grants.
revoke all on sequence public.article_versions_id_seq from public, anon, authenticated, service_role;

-- service_role bypasses RLS, so SELECT works without a policy; anon and
-- authenticated have no privileges and no policies.

create or replace function public.article_save(
  p_id uuid, p_expected_revision integer, p_key text, p_slug text, p_brand text,
  p_workflow text, p_doc jsonb, p_action text, p_actor text
) returns public.article_drafts
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare d public.article_drafts;
begin
  if p_action is null or p_action not in ('import', 'create', 'save', 'approve') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if p_doc is null then
    raise exception 'doc_required' using errcode = '22004';
  end if;

  if p_id is null then
    insert into public.article_drafts (article_key, slug, brand_slug, workflow, doc, updated_by)
    values (p_key, p_slug, p_brand, p_workflow, p_doc, p_actor)
    returning * into d;
  else
    if p_expected_revision is null then
      raise exception 'expected_revision_required' using errcode = '22004';
    end if;
    update public.article_drafts
       set slug = p_slug, brand_slug = p_brand, workflow = p_workflow, doc = p_doc,
           revision = revision + 1, updated_at = now(), updated_by = p_actor
     where id = p_id and revision = p_expected_revision
    returning * into d;
    if not found then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
  end if;

  insert into public.article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, p_action, p_doc, p_actor);
  return d;
end $$;

-- Locks the draft, checks the revision, writes the public snapshot, bumps the
-- draft revision and appends history — all in the caller's single transaction.
-- Returns {"post_id": uuid, "revision": int}.
create or replace function public.article_publish(
  p_id uuid, p_expected_revision integer, p_post jsonb, p_actor text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  d public.article_drafts;
  r public.blog_posts;
  v_post uuid;
begin
  if p_id is null or p_expected_revision is null or p_post is null then
    raise exception 'publish_arguments_required' using errcode = '22004';
  end if;

  select * into d from public.article_drafts where id = p_id for update;
  if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if d.revision is distinct from p_expected_revision then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;
  if d.workflow <> 'approved' then
    raise exception 'not_approved' using errcode = '55000';
  end if;

  r := jsonb_populate_record(null::public.blog_posts, p_post);
  if r.slug is distinct from d.slug then
    raise exception 'slug_mismatch' using errcode = '22023';
  end if;

  update public.article_drafts
     set revision = revision + 1, published_revision = revision + 1,
         first_published_at = coalesce(first_published_at, now()), updated_at = now(), updated_by = p_actor
   where id = d.id
  returning * into d;

  update public.blog_posts set
    slug = r.slug, title = r.title, excerpt = r.excerpt, body = r.body, content = r.content,
    status = 'published', workflow = 'approved', brand_slug = r.brand_slug,
    service_slugs = coalesce(r.service_slugs, '{}'), related_keys = coalesce(r.related_keys, '{}'),
    sources = coalesce(r.sources, '[]'::jsonb), brief = null, cover_url = r.cover_url,
    cover_illustrative = coalesce(r.cover_illustrative, false),
    reviewed_by = r.reviewed_by, reviewed_at = r.reviewed_at, author = r.author,
    published_at = d.first_published_at, updated_at = now(), revision = d.revision
  where article_key = d.article_key
  returning id into v_post;

  if v_post is null then
    insert into public.blog_posts (article_key, slug, title, excerpt, body, content, status, workflow, brand_slug,
      service_slugs, related_keys, sources, brief, cover_url, cover_illustrative, reviewed_by, reviewed_at,
      author, published_at, updated_at, revision)
    values (d.article_key, r.slug, r.title, r.excerpt, r.body, r.content, 'published', 'approved', r.brand_slug,
      coalesce(r.service_slugs, '{}'), coalesce(r.related_keys, '{}'), coalesce(r.sources, '[]'::jsonb), null,
      r.cover_url, coalesce(r.cover_illustrative, false), r.reviewed_by, r.reviewed_at, r.author,
      d.first_published_at, now(), d.revision)
    returning id into v_post;
  end if;

  insert into public.article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, 'publish', p_post, p_actor);
  return jsonb_build_object('post_id', v_post, 'revision', d.revision);
end $$;

-- Removes the public snapshot (recorded in history first) and bumps the
-- revision. Returns the new revision.
create or replace function public.article_unpublish(
  p_id uuid, p_expected_revision integer, p_actor text
) returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  d public.article_drafts;
  snap jsonb;
begin
  if p_id is null or p_expected_revision is null then
    raise exception 'unpublish_arguments_required' using errcode = '22004';
  end if;

  select * into d from public.article_drafts where id = p_id for update;
  if not found then raise exception 'article_not_found' using errcode = 'P0002'; end if;
  if d.revision is distinct from p_expected_revision then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  update public.article_drafts
     set revision = revision + 1, published_revision = null, updated_at = now(), updated_by = p_actor
   where id = d.id
  returning * into d;

  delete from public.blog_posts where article_key = d.article_key returning to_jsonb(blog_posts.*) into snap;

  insert into public.article_versions (draft_id, article_key, revision, action, doc, actor)
  values (d.id, d.article_key, d.revision, 'unpublish', coalesce(snap, d.doc), p_actor);
  return d.revision;
end $$;

revoke all on function public.article_versions_immutable() from public, anon, authenticated, service_role;
revoke all on function public.article_save(uuid, integer, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.article_publish(uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.article_unpublish(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.article_save(uuid, integer, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.article_publish(uuid, integer, jsonb, text) to service_role;
grant execute on function public.article_unpublish(uuid, integer, text) to service_role;

commit;
